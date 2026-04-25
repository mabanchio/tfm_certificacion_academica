# Sistema de Certificacion Academica Digital

Este repositorio implementa un sistema blockchain para gestionar el circuito de certificacion de titulos en Argentina.

## Alcance funcional
- Emision digital verificable por universidad.
- Legalizacion interna por universidad.
- Validacion ministerial por Ministerio de Educacion.
- Apostilla digital por Cancilleria (cuando aplique).
- Verificacion publica por terceros mediante codigo QR y codigo de registro.
- Consulta de egresado por nombre, apellido y CUIT/CUIL.
- Visualizacion de:
  - Titulos en proceso de certificacion.
  - Titulos ya certificados.

## Requisitos de datos e identificacion
- Datos minimos de egresado:
  - Nombre
  - Apellido
  - CUIT/CUIL
- El sistema debe permitir busqueda por estos campos con controles de acceso y trazabilidad.

## Verificacion por QR
- Cada certificacion emite un codigo QR.
- El QR contiene un codigo de registro unico.
- El sitio permite consultar automaticamente el registro asociado y mostrar:
  - Estado de certificacion
  - Titular de la certificacion
  - Organismo/actor que completo cada etapa

## Entorno local de desarrollo
- Wallet recomendada: BackPack.
- Exposicion local para pruebas externas: ngrok.
- El enlace de consulta del QR debe resolverse sobre el dominio publico temporal de ngrok en desarrollo.

## Seguridad (alineacion ISO 27000 e ISO derivadas)
- No almacenar claves privadas en el repositorio ni en archivos versionados.
- Separacion de ambientes: desarrollo, pruebas y produccion.
- Minimizacion de datos personales en blockchain (no exponer PII sensible on-chain).
- Registro de auditoria de eventos criticos (emision, validacion, revocacion, reemision).
- Control de acceso por rol y principio de minimo privilegio.
- Gestion de secretos fuera del codigo fuente.
- Trazabilidad de cambios y revisiones antes de despliegue.
- Validaciones de integridad de documentos por hash criptografico.

## Criterios ISO obligatorios en todo cambio
- Marco de referencia permanente:
  - ISO/IEC 27001 (SGSI)
  - ISO/IEC 27002 (controles)
  - ISO/IEC 27005 (gestion de riesgos)
  - ISO/IEC 27701 (privacidad sobre PII)
- Todo cambio tecnico debe incluir:
  - Analisis de riesgo del cambio (impacto, probabilidad, mitigacion).
  - Validacion de acceso por rol y minimo privilegio.
  - Evidencia de trazabilidad (logs/auditoria) para operaciones criticas.
  - Validacion de tratamiento de PII (nombre, apellido, CUIT/CUIL) con minimizacion y proteccion.
  - Verificacion de no exposicion de secretos ni datos sensibles en codigo, logs o repositorio.
- Controles minimos de desarrollo seguro:
  - Sanitizacion de entradas y validaciones de longitud/formato.
  - Manejo de errores sin filtrar informacion sensible.
  - Dependencias actualizadas y sin vulnerabilidades criticas conocidas.
  - Pruebas de permisos negativos (usuarios no autorizados) y pruebas de integridad.
- Criterio de bloqueo:
  - Si un cambio incumple un control critico ISO de seguridad o privacidad, no se integra.