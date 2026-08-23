/*
 * Fancy Text Generator tool — live-transforms typed text into every style in
 * fancy-text-maps.json (computed + IntlChar-verified server side by
 * build-fancy-text-maps.php, never hand-typed here).
 *
 * Optional UI, all progressive — the generator works with just #tt-gen-in and
 * #tt-gen-out present:
 *   #tt-gen-filter  a text input that filters the style rows by name
 *   #tt-gen-toggle  a button that expands past the first COLLAPSED rows
 */
( function () {
	'use strict';

	var COLLAPSED = 10;

	var STYLE_LABELS = {
		bold: 'Bold', italic: 'Italic', 'bold-italic': 'Bold italic',
		script: 'Script', cursive: 'Cursive', fraktur: 'Fraktur',
		'double-struck': 'Double-struck', monospace: 'Monospace',
		'sans-serif': 'Sans-serif', 'small-caps': 'Small caps',
		'bold-fraktur': 'Bold fraktur', 'sans-bold': 'Sans bold',
		'sans-italic': 'Sans italic', 'sans-bold-italic': 'Sans bold italic',
		fullwidth: 'Fullwidth', bubble: 'Bubble',
		'circled-negative': 'Circled filled', squared: 'Squared',
		'squared-negative': 'Squared filled', regional: 'Regional / flags',
		parenthesized: 'Parenthesized', 'upside-down': 'Upside down',
		strikethrough: 'Strikethrough', underline: 'Underline',
		overline: 'Overline', slash: 'Slashed',
	};

	function transform( text, map ) {
		var out = '';
		for ( var i = 0; i < text.length; i++ ) {
			var ch = text[ i ];
			out += map[ ch ] || map[ ch.toLowerCase() ] || ch;
		}
		return out;
	}

	function transformCombining( text, mark ) {
		var out = '';
		for ( var i = 0; i < text.length; i++ ) {
			out += text[ i ] + ( text[ i ] === ' ' ? '' : String.fromCodePoint( mark ) );
		}
		return out;
	}

	function esc( s ) {
		return s.replace( /[&<>]/g, function ( c ) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ c ]; } );
	}

	// Enqueued in the footer, so the DOM is already parsed by the time this
	// runs — see the matching note in tools.js for why DOMContentLoaded
	// isn't used here.
	var input  = document.getElementById( 'tt-gen-in' );
	var out    = document.getElementById( 'tt-gen-out' );
	var filter = document.getElementById( 'tt-gen-filter' );
	var toggle = document.getElementById( 'tt-gen-toggle' );
	if ( ! input || ! out ) { return; }

	var expanded = false;

	fetch( window.ttFancyTextMapUrl ).then( function ( r ) { return r.json(); } ).then( function ( data ) {
		var keys = Object.keys( data.styles ).concat( Object.keys( data.combining ) );

		function rowHtml( style, result ) {
			var label = STYLE_LABELS[ style ] || style;
			return '<div class="gen-row" data-label="' + esc( label.toLowerCase() ) + '">' +
				'<span class="style">' + esc( label ) + '</span>' +
				'<span class="out">' + esc( result ) + '</span>' +
				'<button class="copybtn" data-copy="' + result.replace( /"/g, '&quot;' ) + '">copy</button>' +
				'</div>';
		}

		function render() {
			var text = input.value || 'Type something above';
			var html = '';
			keys.forEach( function ( style ) {
				var result = data.combining[ style ] !== undefined
					? transformCombining( text, data.combining[ style ] )
					: transform( text, data.styles[ style ] );
				html += rowHtml( style, result );
			} );
			out.innerHTML = html;
			applyVisibility();
		}

		function applyVisibility() {
			var q = ( filter && filter.value || '' ).trim().toLowerCase();
			var rows = out.querySelectorAll( '.gen-row' );
			var matched = 0, shown = 0;
			for ( var i = 0; i < rows.length; i++ ) {
				var hit = ! q || rows[ i ].getAttribute( 'data-label' ).indexOf( q ) !== -1;
				if ( ! hit ) { rows[ i ].style.display = 'none'; continue; }
				matched++;
				// While filtering, show every match; otherwise collapse to the
				// first COLLAPSED unless the user expanded.
				if ( q || expanded || shown < COLLAPSED ) {
					rows[ i ].style.display = '';
					shown++;
				} else {
					rows[ i ].style.display = 'none';
				}
			}
			if ( toggle ) {
				if ( q || matched <= COLLAPSED ) {
					toggle.hidden = true;
				} else {
					toggle.hidden = false;
					toggle.textContent = expanded
						? 'Show fewer styles'
						: 'Show all ' + matched + ' styles';
					toggle.setAttribute( 'aria-expanded', expanded ? 'true' : 'false' );
				}
			}
		}

		var timer;
		input.addEventListener( 'input', function () {
			clearTimeout( timer );
			timer = setTimeout( render, 60 );
		} );
		if ( filter ) { filter.addEventListener( 'input', applyVisibility ); }
		if ( toggle ) {
			toggle.addEventListener( 'click', function () {
				expanded = ! expanded;
				applyVisibility();
			} );
		}
		render();
	} );
} )();
