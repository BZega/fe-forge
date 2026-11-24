# Capacitor Mobile Workflow

FE Forge uses the Angular browser build in `dist/fe-forge/browser` for Capacitor. The website SSR/prerender deployment is unchanged.

## Prerequisites

- Node.js dependencies: `npm install`
- Android: Android Studio and JDK 21
- iOS: macOS, Xcode, and CocoaPods

## Sync Web Changes

```powershell
npm run cap:sync
```

This builds the production Angular app and copies the browser bundle into both native projects.

## Open Native IDEs

```powershell
npm run cap:android
npm run cap:ios
```

The scripts sync current web assets before opening Android Studio or Xcode.

## App Identity

- Display name: `FE Forge`
- Bundle/app ID: `app.feforge.feforge`

Change the app ID before first store release if a different registered namespace is required. Native project bundle IDs and store signing configuration must then be updated in Android Studio and Xcode.

## Store Checklist

- Replace generated launcher icons and splash screens in each native project.
- Set release version/build numbers in Gradle and Xcode.
- Configure Android signing and iOS signing/provisioning.
- Test safe areas, keyboard placement, file upload/download, and external support links on physical devices.

## Notes

The web build and native build share the same Angular source. Server-only output in `dist/fe-forge/server` is not copied into Capacitor apps.
