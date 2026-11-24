#!/usr/bin/env bash
# Diagnóstico de Duplex Assistant en Linux: driver/conexión de la impresora, opciones CUPS,
# registro de CUPS y tinta por página del último trabajo (para ver si los reversos traían páginas en blanco).
# Uso: bash diagnostico-linux.sh   → deja el informe en la carpeta compartida Claude (o en ~).
set -u

SHARED="/run/media/ender/8CB2DB7BB2DB686A/Claude"
if [ -d "$SHARED" ] && [ -w "$SHARED" ]; then OUT="$SHARED/duplex-assistant-diagnostico.txt"; else OUT="$HOME/duplex-assistant-diagnostico.txt"; fi

sec() { printf '\n===== %s =====\n' "$1"; }

{
  echo "Diagnóstico Duplex Assistant · $(date '+%Y-%m-%d %H:%M:%S %Z') · $(uname -sr)"

  sec "Impresoras (lpstat)"
  lpstat -p -d 2>&1
  lpstat -v 2>&1

  PRN="$(lpstat -v 2>/dev/null | grep -iE 'brother|dcp|t710' | head -n1 | sed -E 's/^(device for|dispositivo para) ([^:]+):.*/\2/')"
  [ -z "$PRN" ] && PRN="$(lpstat -d 2>/dev/null | sed -E 's/.*: *//')"
  echo "Impresora analizada: ${PRN:-ninguna}"

  if [ -n "$PRN" ]; then
    sec "Opciones del driver (lpoptions -l)"
    lpoptions -p "$PRN" -l 2>&1
    sec "Opciones guardadas (lpoptions)"
    lpoptions -p "$PRN" 2>&1
    sec "PPD (cabecera y filtros)"
    PPD="/etc/cups/ppd/$PRN.ppd"
    if [ -r "$PPD" ]; then
      grep -E '^\*(NickName|ModelName|Manufacturer|PCFileName|cupsFilter2?|cupsVersion|DefaultPageSize|DefaultResolution|DefaultBR|DefaultColorModel|DefaultMediaType|DefaultInputSlot)' "$PPD"
    else
      echo "Sin PPD legible en $PPD (driverless / IPP Everywhere o sin permisos)"
    fi
  fi

  sec "Paquetes de impresión instalados"
  if command -v pacman >/dev/null; then pacman -Q 2>/dev/null | grep -iE 'brother|cups|ghostscript|gutenprint|foomatic|brlaser|ipp-usb|poppler' ; fi
  ls -d /opt/brother/Printers/* 2>/dev/null

  sec "Últimos trabajos (lpstat -W completed)"
  lpstat -W completed -o 2>/dev/null | tail -n 15

  sec "Registro de CUPS (últimas líneas)"
  if [ -r /var/log/cups/error_log ]; then tail -n 150 /var/log/cups/error_log
  else journalctl -u cups.service --since "-6h" --no-pager -n 200 2>&1 | tail -n 150; fi

  sec "Configuración de Duplex Assistant"
  cat "$HOME/.config/Duplex Assistant/config.json" 2>/dev/null || echo "(sin config.json)"

  sec "Tinta por página del último trabajo (0 en las 4 columnas = página en blanco)"
  JOB="$(ls -1dt /tmp/duplex-assistant/trabajos/*/ 2>/dev/null | head -n1)"
  if [ -z "$JOB" ]; then
    echo "No encontré trabajos en /tmp/duplex-assistant/trabajos (se borran al reiniciar)."
  elif ! command -v gs >/dev/null; then
    echo "Falta Ghostscript (gs) para medir la tinta. Archivos: $(ls "$JOB")"
  else
    echo "Trabajo: $JOB"
    for f in "$JOB"*.pdf; do
      echo "--- $(basename "$f")"
      gs -q -dSAFER -dBATCH -dNOPAUSE -sDEVICE=inkcov -r30 -o - "$f" 2>&1 | nl -w3 -s': pág. '
    done
  fi
} > "$OUT" 2>&1

echo "Listo. Informe guardado en: $OUT"
