---
name: Duplex Assistant
description: La hoja con frente y reverso, en la noche SafeTech, para imprimir a doble cara sin pensar.
colors:
  noche: "#09111F"
  pozo: "#0C1626"
  pizarra: "#111C2F"
  comprobante: "#17243A"
  pizarra-alta: "#20304A"
  linea: "#2A3C57"
  linea-fuerte: "#405776"
  borde-control: "#6B82A3"
  texto: "#F8FAFC"
  texto-suave: "#DBE5F1"
  lead: "#C9D5E3"
  apagado: "#AEBDD0"
  rojo-marca: "#DC2626"
  rojo-profundo: "#991B1B"
  rojo-texto: "#FCA5A5"
  verde-logrado: "#059669"
  verde-sello: "#34D399"
  ambar: "#F59E0B"
  ambar-claro: "#FCD34D"
  papel: "#F4F1EA"
  tinta: "#1B2333"
typography:
  familia: "Segoe UI Variable / Segoe UI (Windows), Inter Variable incluida (Linux)"
  stage-title: "34px / 600"
  pane-title: "18px / 600"
  body: "15px / 1.5"
  lead: "18px / 1.55"
  minimo: "12.5px solo en metadatos y chips"
rounded: { sm: 10px, md: 14px, panel: 20px }
---

# Design System: Duplex Assistant

Hereda el modo oscuro de la guía SafeTech (`web/GUIA_DISENO_SAFETECH.md`, ver `docs/referencia-diseno-office-setup.md`): noche azul pizarra en capas y rojo de marca solo para actuar. Modo **Operar**: la herramienta desaparece en la tarea.

## Firma: la hoja
El objeto propio de la app es la **hoja de papel** (#F4F1EA, flecha roja hacia el borde superior, líneas de tinta). Aparece en el estado vacío, en la simulación de hojas (tarjetas que giran en 3D para mostrar el reverso), en la escena animada de la impresora vista desde arriba y en las miniaturas de calibración. Es el único momento de movimiento protagonista: la hoja que se levanta, se da vuelta si hace falta y entra a la bandeja.

## Semáforo
- **Rojo** (`TE TOCA`, botón principal, paso actual): el usuario debe actuar.
- **Ámbar** (`ESPERA`, avisos): esperar o revisar algo. Los errores se dicen en ámbar.
- **Verde** (`LISTO`, sellos IMPRESO / CALIBRADA, pasos hechos): terminado.

## Estructura
- Barra superior 52 px (marca, navegación Imprimir/Impresora, píldora de impresora con punto de estado) y pie 40 px con «Desarrollado por SafeTech».
- Inicio en 3 columnas: buscador 340 px · vista previa flexible · panel 356 px. El resumen de hojas y el botón principal quedan fijos al pie del panel.
- Asistentes: lista de pasos 320 px con avance total + escenario centrado (chip de estado, título 34 px, bajada, escena 300 px, barra de progreso con estimado, acciones).

## Reglas
- Una sola acción roja por pantalla; las alternativas son botones suaves o fantasma.
- Progreso siempre con texto: «hoja N de M (estimado)» y «faltan ~X».
- Sin sombras en paneles; solo el botón principal, las hojas y los avisos flotantes.
- Foco de teclado ámbar de 3 px separado del control.
- Animaciones con salida exponencial; todo se apaga con `prefers-reduced-motion`.
