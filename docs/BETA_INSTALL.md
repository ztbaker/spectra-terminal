# Spectra Terminal — Beta Install

Thanks for beta-testing. This is a private build — please don't share the installer or the shared key.

## Mac (Apple Silicon or Intel)

1. Download `Spectra-Terminal-<version>.dmg` from the link I sent you.
2. Open the DMG and drag **Spectra Terminal** into `Applications`.
3. First launch: **right-click the app → Open → Open**. macOS will warn that the developer is unidentified — this is expected for an unsigned beta. You only need to do this once.
4. Subsequent launches work with a normal double-click.

## Windows

1. Download `Spectra-Terminal-Setup-<version>.exe` from the link I sent you.
2. Double-click to run. Windows SmartScreen may show a warning — click **More info → Run anyway**.
3. The installer drops a desktop shortcut and Start menu entry.

## Updates

The app checks for new versions automatically a few seconds after launch, and again every 4 hours.

When an update is ready, a toast appears in the bottom-right: **UPDATE vX.Y.Z READY**. Click **RESTART NOW** to install it — the app quits, swaps in the new version, and relaunches. Takes ~5 seconds.

You don't need to download anything manually. If you ignore the toast, the update installs the next time you quit and relaunch.

## Reporting bugs

Type `BUG` in the command bar (or press `/` then type `BUG`). A dialog opens where you can describe what broke. Fill in your name (saved for next time), a one-line summary, and what you expected vs. what happened.

It files a GitHub Issue labeled `beta-bug` automatically — no GitHub account needed on your end. The current screen and any JavaScript error get attached.

## If something breaks hard

If the app won't launch, crashes on startup, or the command bar is totally unresponsive and you can't file a BUG:

Email me at **zbaker88@me.com** with a screenshot and a sentence about what you were doing. Include the version number if you can see it.
