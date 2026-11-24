#!/usr/bin/env bash
# Instalador de Duplex Assistant para Linux · Desarrollado por SafeTech (https://safe-tech.cl)
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/psgonzalogr/duplex-assistant/main/install.sh | bash
# Desinstalar:
#   curl -fsSL https://raw.githubusercontent.com/psgonzalogr/duplex-assistant/main/install.sh | bash -s -- --uninstall
set -euo pipefail

REPO="psgonzalogr/duplex-assistant"
OPT="$HOME/.local/opt/duplex-assistant"
BIN="$HOME/.local/bin/duplex-assistant"
DESKTOP="$HOME/.local/share/applications/duplex-assistant.desktop"
ICON="$HOME/.local/share/icons/hicolor/512x512/apps/duplex-assistant.png"

rojo=$'\e[31m'; verde=$'\e[32m'; ambar=$'\e[33m'; cian=$'\e[36m'; gris=$'\e[90m'; fin=$'\e[0m'
paso() { printf '  %s>%s %s\n' "$cian" "$fin" "$1"; }
aviso() { printf '  %s!%s %s\n' "$ambar" "$fin" "$1"; }

printf '\n  Duplex Assistant\n  %sImprime a doble cara en impresoras sin dúplex automático%s\n  %sDesarrollado por SafeTech · safe-tech.cl%s\n\n' "$gris" "$fin" "$rojo" "$fin"

if [ "${1:-}" = "--uninstall" ]; then
  rm -rf "$OPT" "$BIN" "$DESKTOP" "$ICON"
  command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
  printf '  %sDuplex Assistant se desinstaló.%s (Tu configuración queda en ~/.config/Duplex Assistant)\n\n' "$verde" "$fin"
  exit 0
fi

[ "$(uname -m)" = "x86_64" ] || { aviso "Por ahora solo hay versión para equipos de 64 bits (x86_64)."; exit 1; }

paso "Buscando la última versión…"
json="$(curl -fsSL -H 'User-Agent: duplex-assistant-installer' "https://api.github.com/repos/$REPO/releases/latest")"
url="$(printf '%s' "$json" | grep -o '"browser_download_url": *"[^"]*x86_64\.AppImage"' | head -n1 | sed 's/.*"\(https[^"]*\)"/\1/')"
tag="$(printf '%s' "$json" | grep -o '"tag_name": *"[^"]*"' | head -n1 | sed 's/.*"\([^"]*\)"$/\1/')"
[ -n "$url" ] || { aviso "No encontré el AppImage en la última versión."; exit 1; }

mkdir -p "$OPT" "$(dirname "$BIN")" "$(dirname "$DESKTOP")" "$(dirname "$ICON")"
paso "Descargando $tag…"
curl -fL --progress-bar -o "$OPT/Duplex-Assistant.AppImage.part" "$url"
mv "$OPT/Duplex-Assistant.AppImage.part" "$OPT/Duplex-Assistant.AppImage"
chmod +x "$OPT/Duplex-Assistant.AppImage"
curl -fsSL -o "$ICON" "https://raw.githubusercontent.com/$REPO/main/build/icon.png" || true

# Los AppImage necesitan FUSE 2. Si no está, se extraen al vuelo (un poco más lento, pero funciona).
extra=""
if ! (ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'); then
  extra="APPIMAGE_EXTRACT_AND_RUN=1"
  aviso "No encontré FUSE 2: la app abrirá igual. Para que abra más rápido instala fuse2 (Arch/CachyOS: sudo pacman -S fuse2 · Ubuntu: sudo apt install libfuse2t64)."
fi

cat > "$BIN" <<EOF
#!/usr/bin/env bash
exec env $extra "$OPT/Duplex-Assistant.AppImage" --no-sandbox "\$@"
EOF
chmod +x "$BIN"

cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Duplex Assistant
GenericName=Impresión a doble cara
Comment=Imprime a doble cara en impresoras sin dúplex automático · SafeTech
Exec=$BIN %F
Icon=duplex-assistant
Terminal=false
Categories=Office;Utility;
Keywords=imprimir;doble cara;duplex;impresora;
MimeType=application/pdf;
StartupWMClass=Duplex Assistant
EOF
command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true

command -v lp >/dev/null || aviso "No encontré CUPS (lp). Instálalo y configura tu impresora para poder imprimir."
command -v soffice >/dev/null || command -v libreoffice >/dev/null || aviso "Para imprimir Word, Excel o PowerPoint instala LibreOffice (Arch/CachyOS: sudo pacman -S libreoffice-fresh)."

printf '\n  %sListo.%s Abre «Duplex Assistant» desde el menú de aplicaciones o escribe: duplex-assistant\n\n' "$verde" "$fin"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) aviso "Agrega ~/.local/bin a tu PATH para usar el comando duplex-assistant." ;; esac
