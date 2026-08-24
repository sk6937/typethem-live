/*
 * Copy-to-clipboard for keycaps, mini keycaps, copy-as buttons, and table
 * copy buttons — all share the [data-copy] contract from the prototype.
 * Single delegated listener on document, not one per element: keeps this
 * page-count-independent and protects INP on click-heavy pages.
 */
( function () {
	'use strict';

	var toast, toastch, hideTimer;

	function ensureToast() {
		if ( toast ) return;
		toast = document.getElementById( 'tt-toast' );
		toastch = document.getElementById( 'tt-toast-ch' );
	}

	function showToast( value ) {
		ensureToast();
		if ( ! toast ) return;
		toastch.textContent = value.length > 10 ? value.slice( 0, 10 ) + '…' : value;
		toast.classList.add( 'show' );
		clearTimeout( hideTimer );
		hideTimer = setTimeout( function () {
			toast.classList.remove( 'show' );
		}, 1400 );
	}

	function copy( value, el ) {
		if ( navigator.clipboard ) {
			navigator.clipboard.writeText( value ).catch( function () {} );
		}
		if ( el && el.classList.contains( 'keycap' ) ) {
			el.classList.add( 'pressed' );
			setTimeout( function () {
				el.classList.remove( 'pressed' );
			}, 160 );
		}
		showToast( value );
	}

	document.addEventListener( 'click', function ( ev ) {
		var el = ev.target.closest( '[data-copy]' );
		if ( ! el ) return;
		ev.preventDefault();
		copy( el.getAttribute( 'data-copy' ), el );
	} );

	/*
	 * Theme toggle + mobile nav. Both run at top level rather than inside a
	 * DOMContentLoaded listener: this file is enqueued in the footer, so the
	 * DOM is already parsed by the time it executes and that event has usually
	 * already fired — a listener here would silently never run.
	 *
	 * The stored choice is applied by a tiny inline script in <head> (see
	 * functions.php) so there's no flash; this only handles the click. With no
	 * stored choice the attribute is absent and CSS prefers-color-scheme
	 * decides, so the first click has to resolve what's actually showing
	 * rather than assume light.
	 */
	var toggle = document.getElementById( 'tt-theme-toggle' );
	if ( toggle ) {
		toggle.addEventListener( 'click', function () {
			var root = document.documentElement;
			var explicit = root.getAttribute( 'data-theme' );
			var showingDark = explicit
				? explicit === 'dark'
				: window.matchMedia( '(prefers-color-scheme: dark)' ).matches;
			var next = showingDark ? 'light' : 'dark';
			root.setAttribute( 'data-theme', next );
			try {
				localStorage.setItem( 'tt-theme', next );
			} catch ( e ) {}
		} );
	}

	var burger = document.getElementById( 'tt-burger' );
	var nav = document.getElementById( 'tt-nav' );
	if ( burger && nav ) {
		burger.addEventListener( 'click', function () {
			var open = nav.classList.toggle( 'open' );
			burger.setAttribute( 'aria-expanded', open ? 'true' : 'false' );
		} );
	}

	/*
	 * Categorized cookie-consent banner. The <head> bootstrap (functions.php) has
	 * already set Consent Mode to denied and re-applied any stored per-category
	 * choice before gtag/adsbygoogle ran; this handles the UI. The choice is stored
	 * as JSON ({analytics, ads}) under 'tt_consent' and mapped to Consent Mode
	 * signals — analytics->analytics_storage, ads->ad_storage/ad_user_data/
	 * ad_personalization. "Accept all"/"Reject all" set every category; "Manage"
	 * reveals per-category toggles; the footer "Cookie preferences" button reopens
	 * it so consent can be withdrawn. Top-level for the footer-enqueue reason above.
	 */
	var consent = document.getElementById( 'tt-consent' );
	if ( consent ) {
		var consentMain = consent.querySelector( '.tt-consent-main' );
		var consentPrefs = consent.querySelector( '.tt-consent-prefs' );
		var catInputs = consent.querySelectorAll( '[data-consent-cat]' );
		var adsPresent = !! consent.querySelector( '[data-consent-cat="ads"]' );

		var readStored = function () {
			try {
				var raw = localStorage.getItem( 'tt_consent' );
				if ( ! raw ) { return null; }
				if ( raw.charAt( 0 ) === '{' ) { return JSON.parse( raw ); }
				return { analytics: raw === 'granted', ads: false }; // migrate legacy string
			} catch ( e ) { return null; }
		};

		var applyChoice = function ( choice ) {
			try { localStorage.setItem( 'tt_consent', JSON.stringify( choice ) ); } catch ( e ) {}
			if ( typeof window.gtag === 'function' ) {
				window.gtag( 'consent', 'update', {
					analytics_storage:  choice.analytics ? 'granted' : 'denied',
					ad_storage:         choice.ads ? 'granted' : 'denied',
					ad_user_data:       choice.ads ? 'granted' : 'denied',
					ad_personalization: choice.ads ? 'granted' : 'denied'
				} );
			}
			consent.hidden = true;
			if ( consentPrefs ) { consentPrefs.hidden = true; }
			if ( consentMain ) { consentMain.hidden = false; }
		};

		var openConsent = function ( showPrefs ) {
			var cur = readStored() || { analytics: false, ads: false };
			Array.prototype.forEach.call( catInputs, function ( inp ) {
				inp.checked = !! cur[ inp.getAttribute( 'data-consent-cat' ) ];
			} );
			if ( consentMain ) { consentMain.hidden = !! showPrefs; }
			if ( consentPrefs ) { consentPrefs.hidden = ! showPrefs; }
			consent.hidden = false;
		};

		if ( ! readStored() ) { openConsent( false ); }

		consent.addEventListener( 'click', function ( ev ) {
			var b = ev.target.closest( '[data-consent-action]' );
			if ( ! b ) { return; }
			var act = b.getAttribute( 'data-consent-action' );
			if ( act === 'accept' ) { applyChoice( { analytics: true, ads: adsPresent } ); }
			else if ( act === 'reject' ) { applyChoice( { analytics: false, ads: false } ); }
			else if ( act === 'manage' ) { openConsent( true ); }
			else if ( act === 'save' ) {
				var choice = { analytics: false, ads: false };
				Array.prototype.forEach.call( catInputs, function ( inp ) {
					choice[ inp.getAttribute( 'data-consent-cat' ) ] = inp.checked;
				} );
				applyChoice( choice );
			}
		} );

		var reopen = document.getElementById( 'tt-cookie-settings' );
		if ( reopen ) {
			reopen.addEventListener( 'click', function () { openConsent( true ); } );
		}
	}

	/*
	 * Load-more for keycap tile grids (.rel). Big sets like "Characters in this
	 * set" can hold 20-48 tiles, which swamps the page — so collapse any grid
	 * past LIMIT tiles and inject a pill button to reveal the rest. All tiles
	 * stay in the DOM (links remain crawlable for SEO); only their display is
	 * toggled. Runs at top level for the same footer-enqueue reason as above.
	 */
	Array.prototype.forEach.call( document.querySelectorAll( '.tt-page .rel' ), function ( row ) {
		// Related-character rows stay tight at 6; a collection-facet grid IS the
		// page's primary content (up to ~150 tiles), so it shows a generous set
		// before the "Show all" pill.
		var LIMIT = row.classList.contains( 'rel-facet' ) ? 48 : 6;
		var items = row.querySelectorAll( ':scope > a' );
		if ( items.length <= LIMIT ) return;
		for ( var i = LIMIT; i < items.length; i++ ) {
			items[ i ].classList.add( 'tt-hidden' );
		}
		row.classList.add( 'tt-collapsed' );

		var btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = 'loadmore';
		btn.setAttribute( 'aria-expanded', 'false' );
		var labelMore = 'Show all ' + items.length + ' ↓';
		var labelLess = 'Show fewer ↑';
		btn.textContent = labelMore;
		btn.addEventListener( 'click', function () {
			var collapsed = row.classList.toggle( 'tt-collapsed' );
			btn.setAttribute( 'aria-expanded', collapsed ? 'false' : 'true' );
			btn.textContent = collapsed ? labelMore : labelLess;
		} );
		row.parentNode.insertBefore( btn, row.nextSibling );
	} );
} )();
