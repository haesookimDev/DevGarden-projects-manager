# Icons (placeholder)

이 디렉토리는 Tauri 빌드 시 필요한 아이콘 파일을 보관한다.

MVP scaffold 단계에서는 아이콘이 비어 있다. 실제 `pnpm tauri:build`를 수행하기 전에 다음 파일이 채워져야 한다:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns` (macOS)
- `icon.ico` (Windows)

생성 도구: `pnpm tauri icon <source.png>` — 단일 1024x1024 PNG에서 모든 사이즈 생성.

`pnpm tauri:dev`는 아이콘 없이도 동작한다 (개발 모드에서는 번들링하지 않음).
