// Firefox preferences for the local graphical console.
//
// Copied into a fresh profile by console-entrypoint.sh on every start, with
// @DOWNLOAD_DIR@ substituted. Things that enterprise policy can express live
// in policies.json instead; this file is for the rest.

// First run / chrome.
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("browser.aboutwelcome.enabled", false);
user_pref("browser.toolbars.bookmarks.visibility", "never");
user_pref("browser.tabs.warnOnClose", false);
user_pref("browser.warnOnQuit", false);

// The supervisor loop restarts Firefox when it exits, so never offer to
// restore the previous session -- that dialog would block the UI behind a
// prompt the operator may not know how to dismiss.
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.sessionstore.max_resumed_crashes", 0);
user_pref("toolkit.startup.max_resumed_crashes", -1);

// Disconnected environment: nothing outbound can succeed, so make sure
// nothing stalls or shows a connectivity banner trying.
user_pref("network.captive-portal-service.enabled", false);
user_pref("network.connectivity-service.enabled", false);
user_pref("browser.region.update.enabled", false);
user_pref("browser.region.network.url", "");
user_pref("browser.safebrowsing.malware.enabled", false);
user_pref("browser.safebrowsing.phishing.enabled", false);
user_pref("browser.safebrowsing.downloads.enabled", false);
user_pref("browser.search.suggest.enabled", false);
user_pref("network.dns.disablePrefetch", true);
user_pref("network.prefetch-next", false);
user_pref("extensions.blocklist.enabled", false);
user_pref("extensions.update.enabled", false);
user_pref("extensions.systemAddon.update.enabled", false);
user_pref("app.update.auto", false);
user_pref("toolkit.telemetry.enabled", false);
user_pref("toolkit.telemetry.unified", false);
user_pref("datareporting.healthreport.uploadEnabled", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("browser.crashReports.unsubmittedCheck.autoSubmit2", false);

// Baremetal servers generally have an ASPEED or Matrox BMC GPU with no 3D
// engine, so Mesa falls back to llvmpipe. Take the software WebRender path
// deliberately rather than letting Firefox probe for acceleration.
user_pref("gfx.webrender.software", true);
user_pref("layers.acceleration.disabled", true);
user_pref("general.smoothScroll", false);

// Downloads (kubeconfig, logs) must not pop a file chooser: there is no file
// manager behind this and the dialog would be a dead end.
user_pref("browser.download.folderList", 2);
user_pref("browser.download.dir", "@DOWNLOAD_DIR@");
user_pref("browser.download.useDownloadDir", true);
user_pref("browser.download.alwaysOpenPanel", false);
user_pref("widget.use-xdg-desktop-portal.file-picker", 0);

// ConsoleModal calls window.open(consoleUrl, '_blank') during installation.
// Open a genuine second kiosk window (2), closeable with Ctrl-W, rather than
// navigating the progress page away in place (1) -- there is no back button
// in kiosk mode.
user_pref("browser.link.open_newwindow", 2);
user_pref("browser.link.open_newwindow.restriction", 0);

// If the proxy was configured with TLS_CERT/TLS_KEY it is probably serving a
// self-signed certificate. Honour CAs from the container trust store and give
// a usable interstitial if we still do not trust it.
user_pref("security.enterprise_roots.enabled", true);
user_pref("browser.xul.error_pages.expert_bad_cert", true);

// The container already confines us, and Firefox's own content sandbox needs
// user namespace and seccomp operations podman may not grant.
user_pref("security.sandbox.content.level", 0);
