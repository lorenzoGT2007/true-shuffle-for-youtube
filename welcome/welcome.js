'use strict';

// Shared by welcome.html and whats-new.html.
const { t, translate } = TrueShuffleI18n;

translate(document);
const version = document.getElementById('version');
if (version) version.textContent = t('optVersion', chrome.runtime.getManifest().version);
