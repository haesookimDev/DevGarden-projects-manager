# Icons

Tauri 빌드 시 컴파일러가 임베드하는 아이콘 파일들. `tauri.conf.json` 의 `bundle.icon` 에 나열된 파일이 모두 존재해야 `pnpm tauri build` 가 성공한다.

v0.1 placeholder 는 단색 DevGarden 그린 PNG 다. 실제 브랜드 자산이 생기면 같은 절차로 교체:

```bash
# 1. 1024x1024 source PNG 준비 (없으면 placeholder 생성)
node scripts/gen-icon-source.mjs            # → src-tauri/icons/source.png

# 2. 모든 플랫폼 변종 생성
pnpm tauri icon src-tauri/icons/source.png  # 32x32 / 128x128 / icon.icns / icon.ico / android/ / ios/ / Square*Logo
```

자체 source.png 가 있다면 (1) 스킵하고 바로 (2) 만 — `tauri icon <path>` 가 PNG 라면 어디서든 받는다.
