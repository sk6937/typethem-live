/*
 * Homepage unified search + 4 of the 5 tool pages (Symbol Finder, Alt Code
 * Finder, Accent Builder, Emoji Finder) — all share one search-index.json
 * fetch and one result-rendering routine. The Fancy Text Generator doesn't
 * search anything (it transforms typed text), so it's a separate file
 * (fancy-text.js) that never loads this index.
 *
 * Zero-result logging: the manifest asks tools to "log zero-result
 * searches for demand discovery." No analytics backend is wired up yet
 * (nothing in CLAUDE.md names one), so this stores unmatched queries in
 * localStorage only — a real sink (e.g. a small Cloudflare Worker once the
 * site is static) is future work, not something to fabricate here.
 */
( function () {
	'use strict';

	var indexPromise = null;
	function loadIndex() {
		if ( ! indexPromise ) {
			indexPromise = fetch( window.ttSearchIndexUrl ).then( function ( r ) { return r.json(); } );
		}
		return indexPromise;
	}

	function logZeroResult( query ) {
		query = query.trim().toLowerCase();
		if ( query.length < 2 ) { return; }
		try {
			var log = JSON.parse( localStorage.getItem( 'tt_zero_result_log' ) || '{}' );
			log[ query ] = ( log[ query ] || 0 ) + 1;
			var keys = Object.keys( log );
			if ( keys.length > 200 ) { delete log[ keys[ 0 ] ]; }
			localStorage.setItem( 'tt_zero_result_log', JSON.stringify( log ) );
		} catch ( e ) { /* localStorage unavailable — nothing to fall back to, safe to ignore */ }
	}

	function escapeHtml( s ) {
		return String( s ).replace( /[&<>"']/g, function ( c ) {
			return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ c ];
		} );
	}

	// Relevance score for one field's text against the query. Higher is better;
	// 0 means no match. Exact > whole-word (earlier word ranks higher) >
	// starts-with > substring — so "arrow" surfaces "Black Rightwards Arrow"
	// above "Mobile Phone With Rightwards Arrow At Left", and "tick" doesn't
	// bury ✓ under "Chopsticks".
	function fieldScore( text, q ) {
		if ( ! text ) { return 0; }
		text = String( text ).toLowerCase();
		if ( text === q ) { return 1000; }
		var idx = text.indexOf( q );
		if ( idx === -1 ) { return 0; }
		var before = idx === 0 ? '' : text.charAt( idx - 1 );
		var after  = text.charAt( idx + q.length );
		var wordStart = idx === 0 || /[^a-z0-9]/.test( before );
		var wordEnd   = after === '' || /[^a-z0-9]/.test( after );
		var score;
		if ( wordStart && wordEnd ) { score = 700; }        // whole-word match
		else if ( wordStart ) { score = 500; }              // starts a word
		else { score = 200; }                               // mid-word substring
		// Earlier match and shorter overall text are more on-point.
		score -= Math.min( idx, 60 );
		score -= Math.min( Math.floor( text.length / 4 ), 40 );
		return score;
	}

	// Best score across the searchable fields; name (n) / title (t) count full,
	// curated keywords (k) count nearly full, code point (cp) / glyph (g) are a
	// weak exact-ish fallback so "2713" or a pasted glyph still resolves.
	function scoreItem( item, q, fields ) {
		var best = 0;
		for ( var i = 0; i < fields.length; i++ ) {
			var f = fields[ i ], s = 0;
			if ( f === 'k' ) {
				// keywords is a space/comma list — score each token, keep best.
				var kws = String( item.k || '' ).toLowerCase().split( /[\s,]+/ );
				for ( var j = 0; j < kws.length; j++ ) {
					if ( kws[ j ] === q ) { s = Math.max( s, 900 ); }
					else if ( kws[ j ].indexOf( q ) === 0 ) { s = Math.max( s, 620 ); }
				}
				if ( String( item.k || '' ).toLowerCase().indexOf( q ) !== -1 ) { s = Math.max( s, 300 ); }
			} else if ( f === 'cp' || f === 'g' ) {
				s = ( item[ f ] && String( item[ f ] ).toLowerCase().indexOf( q ) !== -1 ) ? 650 : 0;
			} else {
				s = fieldScore( item[ f ], q );
			}
			if ( s > best ) { best = s; }
		}
		return best;
	}

	var RESULT_CAP = 60;

	function renderResults( el, items, opts ) {
		if ( ! items.length ) {
			el.innerHTML = '<p class="empty">No matches yet — try a different spelling or a plainer word.</p>';
			return;
		}
		var shown = Math.min( items.length, RESULT_CAP );
		var count = items.length > RESULT_CAP
			? 'Showing the top ' + RESULT_CAP + ' of ' + items.length + ' matches — add a word to narrow it down.'
			: items.length + ( items.length === 1 ? ' match' : ' matches' );
		var html = '<p class="rescount">' + count + '</p><div class="results">';
		items.slice( 0, RESULT_CAP ).forEach( function ( item ) {
			var glyph = escapeHtml( item.g || '' );
			var name = escapeHtml( item.n || item.t || '' );
			var href = item.u || '#';
			var sub = '';
			if ( opts.mode === 'alt-codes' ) {
				sub = item.alt ? 'Alt+' + escapeHtml( item.alt ) : 'no legacy code · Alt+X ' + escapeHtml( item.cp || '' );
			} else if ( item.cp ) {
				sub = 'U+' + escapeHtml( item.cp );
			}
			html += '<a class="rescard" href="' + href + '">' +
				'<span class="glyph" data-copy="' + glyph + '">' + glyph + '</span>' +
				'<span>' + name + '</span>' +
				( sub ? '<span class="alt">' + sub + '</span>' : '' ) +
				'</a>';
		} );
		html += '</div>';
		el.innerHTML = html;
	}

	function initSearch( input ) {
		// data-tt-search lives on the <input> itself in every template
		// (homepage.php, tool.php) — not on a wrapping container.
		var scope = input.getAttribute( 'data-scope' ) || 'all';
		var resultsEl = document.getElementById( input.getAttribute( 'data-results' ) );
		if ( ! resultsEl ) { return; }

		// Idle blocks (popular grid / browse / how-it-works) collapse the moment a
		// query is active so the result grid owns the space, and come back when
		// the box is cleared. Scoped to this input's own tool-main container.
		var idle = ( input.closest( 'main' ) || document ).querySelector( '[data-tt-idle]' );
		function setIdle( searching ) {
			if ( idle ) { idle.hidden = searching; }
		}

		var timer;
		input.addEventListener( 'input', function () {
			clearTimeout( timer );
			timer = setTimeout( function () { runSearch( input.value ); }, 120 );
		} );

		// Example-query chips (tool.php) drive this same search.
		( input.closest( '.searchbox' ) || document ).querySelectorAll( '[data-tt-example]' ).forEach( function ( chip ) {
			chip.addEventListener( 'click', function () {
				input.value = chip.getAttribute( 'data-tt-example' );
				input.focus();
				runSearch( input.value );
			} );
		} );

		function runSearch( raw ) {
			var q = raw.trim().toLowerCase();
			if ( q.length < 1 ) { resultsEl.innerHTML = ''; setIdle( false ); return; }
			setIdle( true );
			loadIndex().then( function ( idx ) {
				var pool, fields, mode = scope;
				if ( scope === 'emoji' ) {
					pool = idx.emoji; fields = [ 'n', 'k' ];
				} else if ( scope === 'alt-codes' ) {
					pool = idx.characters; fields = [ 'n', 'k', 'cp' ]; mode = 'alt-codes';
				} else if ( scope === 'characters' ) {
					pool = idx.characters; fields = [ 'n', 'k', 'cp', 'g' ];
				} else { // 'all' — homepage: characters + guides + emoji together
					pool = idx.characters.concat( idx.guides ).concat( idx.emoji );
					fields = [ 'n', 't', 'k', 'cp' ];
				}
				var found = [];
				for ( var i = 0; i < pool.length; i++ ) {
					var s = scoreItem( pool[ i ], q, fields );
					if ( s > 0 ) { found.push( { it: pool[ i ], s: s } ); }
				}
				found.sort( function ( a, b ) {
					if ( b.s !== a.s ) { return b.s - a.s; }
					// tie-break: shorter name first (the plainer character)
					return String( a.it.n || a.it.t || '' ).length - String( b.it.n || b.it.t || '' ).length;
				} );
				var items = found.map( function ( r ) { return r.it; } );
				renderResults( resultsEl, items, { mode: mode } );
				if ( ! items.length ) { logZeroResult( q ); }
			} );
		}
	}

	function initAccentBuilder( box ) {
		var letterSel = box.querySelector( '[data-role="letter"]' );
		var accentSel = box.querySelector( '[data-role="accent"]' );
		var out = box.querySelector( '.out' );
		var link = box.querySelector( '.builder-link' );
		if ( ! letterSel || ! accentSel || ! out ) { return; }

		function update() {
			var letter = letterSel.value, accent = accentSel.value;
			loadIndex().then( function ( idx ) {
				var wantName = ( 'LATIN SMALL LETTER ' + letter.toUpperCase() + ' WITH ' + accent.toUpperCase() );
				var hit = idx.characters.find( function ( c ) { return ( c.n || '' ).toUpperCase() === wantName; } );
				if ( ! hit ) {
					wantName = ( 'LATIN CAPITAL LETTER ' + letter.toUpperCase() + ' WITH ' + accent.toUpperCase() );
					hit = idx.characters.find( function ( c ) { return ( c.n || '' ).toUpperCase() === wantName; } );
				}
				if ( hit ) {
					out.textContent = hit.g;
					out.setAttribute( 'data-copy', hit.g );
					link.href = hit.u;
					link.style.display = '';
					out.classList.remove( 'empty' );
				} else {
					out.textContent = '—';
					out.removeAttribute( 'data-copy' );
					link.style.display = 'none';
				}
			} );
		}
		letterSel.addEventListener( 'change', update );
		accentSel.addEventListener( 'change', update );
		update();
	}

	// Enqueued in the footer, so the DOM is already parsed by the time this
	// runs — a DOMContentLoaded listener registered here would fire too late
	// (the event has usually already dispatched), so init runs immediately
	// instead, same as typethem.js's top-level click listener.
	document.querySelectorAll( '[data-tt-search]' ).forEach( initSearch );
	document.querySelectorAll( '[data-tt-builder]' ).forEach( initAccentBuilder );
} )();
