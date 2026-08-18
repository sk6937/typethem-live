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

	function matches( item, q, fields ) {
		for ( var i = 0; i < fields.length; i++ ) {
			var v = item[ fields[ i ] ];
			if ( v && String( v ).toLowerCase().indexOf( q ) !== -1 ) { return true; }
		}
		return false;
	}

	function renderResults( el, items, opts ) {
		if ( ! items.length ) {
			el.innerHTML = '<p class="empty">No matches yet — try a different spelling or a plainer word.</p>';
			return;
		}
		var html = '<div class="results">';
		items.slice( 0, 60 ).forEach( function ( item ) {
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

		var timer;
		input.addEventListener( 'input', function () {
			clearTimeout( timer );
			timer = setTimeout( function () { runSearch( input.value ); }, 120 );
		} );

		function runSearch( raw ) {
			var q = raw.trim().toLowerCase();
			if ( q.length < 1 ) { resultsEl.innerHTML = ''; return; }
			loadIndex().then( function ( idx ) {
				var pool, fields, mode = scope;
				if ( scope === 'emoji' ) {
					pool = idx.emoji; fields = [ 'n' ];
				} else if ( scope === 'alt-codes' ) {
					pool = idx.characters; fields = [ 'n', 'cp' ]; mode = 'alt-codes';
				} else if ( scope === 'characters' ) {
					pool = idx.characters; fields = [ 'n', 'cp', 'g' ];
				} else { // 'all' — homepage: characters + guides + emoji together
					pool = idx.characters.concat( idx.guides ).concat( idx.emoji );
					fields = [ 'n', 't', 'cp' ];
				}
				var found = pool.filter( function ( item ) { return matches( item, q, fields ); } );
				renderResults( resultsEl, found, { mode: mode } );
				if ( ! found.length ) { logZeroResult( q ); }
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
