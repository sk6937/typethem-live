/*
 * Single-style live generator for the per-style guide pages
 * (/fancy-text/{style}/). Reads the same IntlChar-verified fancy-text-maps.json
 * the flagship uses, but transforms into just one style, named by data-tt-style
 * on the input. Enqueued in the footer, so the DOM is already parsed.
 */
( function () {
	'use strict';

	var input   = document.getElementById( 'tt-style-in' );
	var outEl   = document.getElementById( 'tt-style-out' );
	var copyBtn = document.getElementById( 'tt-style-copy' );
	if ( ! input || ! outEl ) { return; }

	var style = input.getAttribute( 'data-tt-style' );

	fetch( window.ttFancyTextMapUrl ).then( function ( r ) { return r.json(); } ).then( function ( data ) {
		var map  = data.styles[ style ];
		var mark = data.combining[ style ];

		function render() {
			var text = input.value || input.getAttribute( 'placeholder' ) || '';
			var res = '';
			if ( map ) {
				for ( var i = 0; i < text.length; i++ ) {
					var ch = text[ i ];
					res += map[ ch ] || map[ ch.toLowerCase() ] || ch;
				}
			} else if ( mark !== undefined ) {
				for ( var j = 0; j < text.length; j++ ) {
					res += text[ j ] + ( text[ j ] === ' ' ? '' : String.fromCodePoint( mark ) );
				}
			} else {
				res = text;
			}
			outEl.textContent = res;
			if ( copyBtn ) { copyBtn.setAttribute( 'data-copy', res ); }
		}

		var timer;
		input.addEventListener( 'input', function () {
			clearTimeout( timer );
			timer = setTimeout( render, 60 );
		} );
		render();
	} );
} )();
