# Product

<!-- impeccable:product-schema 1 -->

<!-- Escrito a partir del pedido del dueño (2026-11-24). Lo marcado como (inferido) no fue confirmado por él. -->

## Platform

Aplicación de escritorio multiplataforma (Electron): Windows 10/11 (`.exe`) y Linux (`.AppImage`, probado en CachyOS/Arch). Se instala con un comando de terminal (PowerShell `irm … | iex` en Windows, `curl … | bash` en Linux) o descargando el archivo de la última versión en GitHub Releases.

## Users

Personas con impresoras de inyección de tinta sin dúplex automático (caso de origen: Brother DCP-T710W) que necesitan imprimir varias copias a doble cara: apuntes, guías, contratos, material de clases. El dueño de SafeTech es el primer usuario (Windows 11 y CachyOS). Usuarios básicos o intermedios (inferido), que hoy dan vuelta hoja por hoja o pierden papel por equivocarse de orientación.

## Product Purpose

Que imprimir N copias a doble cara en una impresora sin dúplex sea: elegir el archivo, decir cuántas copias, apretar Imprimir, dar vuelta el mazo una sola vez cuando la app lo pida y listo. La app arma el orden exacto de las caras (impares para todas las copias, luego pares en el orden que pide la impresora, con hojas en blanco cuando el documento tiene páginas impares) y guía cada paso con progreso visible. Éxito: cero hojas perdidas y nadie tiene que pensar en impares/pares.

## Positioning

Un asistente que aprende cómo tu impresora entrega y recibe el papel (calibración con hoja de prueba visual) y desde ahí nunca más te equivocas. Acepta cualquier documento (PDF, Word, Excel, PowerPoint, imágenes, texto), lo muestra antes de imprimir y lo encuentra solo en el computador.

## Operating Context

- El usuario está de pie junto a la impresora: mira la pantalla de lejos y con las manos ocupadas con papel. Necesita instrucciones grandes, una acción por pantalla y saber cuándo esperar y cuándo actuar.
- La impresión de la primera cara puede tardar minutos (10 copias × varias hojas); el usuario necesita saber cuánto falta.
- Ajustes del driver (calidad, papel, color) se guardan por perfil propio de la app sin tocar la configuración de los demás programas (Windows); en Linux se usan las opciones CUPS de la impresora.

## Capabilities and Constraints

- Entrada: PDF nativo; imágenes y texto convertidos dentro de la app; documentos de Office/LibreOffice convertidos con LibreOffice (Windows y Linux) o Microsoft Office (Windows) si están instalados.
- Impresión: Windows con SumatraPDF incluido; Linux con CUPS (`lp`).
- Sin cuenta, sin internet, sin telemetría.
- Calibración por impresora: orden de salida (invertir reversos) y giro de 180°.

## Brand Commitments

- SafeTech, modo oscuro de la guía `web/GUIA_DISENO_SAFETECH.md` del repo SafeTech (misma paleta que el instalador de Office: noche #09111F, pizarras #111C2F / #17243A / #20304A, rojo #DC2626 → #991B1B, textos #F8FAFC / #DBE5F1 / #AEBDD0, semáforo rojo actuar · verde logrado · ámbar atención).
- Pie visible: «Desarrollado por SafeTech» con enlace a safe-tech.cl.
- Español de Chile, claro y sin tecnicismos.

## Evidence on Hand

No hay testimonios ni cifras: no inventarlos.

## Product Principles

1. Una sola acción por pantalla y siempre se ve qué hacer: «Aprieta…», «Espera…», «Toma el mazo…».
2. Mostrar antes de gastar papel: vista previa y simulación de cada hoja.
3. Nunca quedar sin salida: cancelar, volver, reanudar desde una hoja.
4. Honestidad: los tiempos son estimados y se dice así.

## Accessibility & Inclusion

Texto base 16–17 px, objetivos de clic de 44 px o más, contraste ≥ 4.5:1, foco de teclado visible, sin depender solo del color, animaciones que respetan `prefers-reduced-motion`.
