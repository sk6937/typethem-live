/*
 * Fancy Text Generator tool — live-transforms typed text into all 12
 * styles using fancy-text-maps.json (computed + IntlChar-verified server
 * side by build-fancy-text-maps.php, never hand-typed here).
 */
( function () {
	'use strict';

	var STYLE_LABELS = {
		bold: 'Bold', italic: 'Italic', script: 'Script', cursive: 'Cursive',
		fraktur: 'Fraktur', 'double-struck': 'Double-struck', monospace: 'Monospace',
		bubble: 'Bubble', 'small-caps': 'Small caps', 'upside-down': 'Upside down',
		strikethrough: 'Strikethrough', underline: 'Underline',
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

	// Enqueued in the footer, so the DOM is already parsed by the time this
	// runs — see the matching note in tools.js for why DOMContentLoaded
	// isn't used here.
	var input = document.getElementById( 'tt-gen-in' );
	var out = document.getElementById( 'tt-gen-out' );
	if ( ! input || ! out ) { return; }

	fetch( window.ttFancyTextMapUrl ).then( function ( r ) { return r.json(); } ).then( function ( data ) {
		function render() {
			var text = input.value || 'Type something above';
			var rows = '';
			Object.keys( data.styles ).forEach( function ( style ) {
				var result = transform( text, data.styles[ style ] );
				rows += rowHtml( style, result );
			} );
			Object.keys( data.combining ).forEach( function ( style ) {
				var result = transformCombining( text, data.combining[ style ] );
				rows += rowHtml( style, result );
			} );
			out.innerHTML = rows;
		}
		function rowHtml( style, result ) {
			return '<div class="gen-row">' +
				'<span class="style">' + ( STYLE_LABELS[ style ] || style ) + '</span>' +
				'<span class="out">' + result.replace( /[&<>]/g, function ( c ) { return { '&':'&amp;','<':'&lt;','>':'&gt;' }[ c ]; } ) + '</span>' +
				'<button class="copybtn" data-copy="' + result.replace( /"/g, '&quot;' ) + '">copy</button>' +
				'</div>';
		}
		var timer;
		input.addEventListener( 'input', function () {
			clearTimeout( timer );
			timer = setTimeout( render, 60 );
		} );
		render();
	} );
} )();
