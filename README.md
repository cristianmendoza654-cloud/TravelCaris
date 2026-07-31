# TravelCaris

Organizador familiar de viajes, itinerarios, vuelos, mapas, reservas y gastos. Es una PWA móvil, local y privada: Londres en familia 2026 es el primer viaje cargado, pero se pueden crear y alternar otros viajes.

## Puesta en marcha

Requisitos: Windows 11 y Node.js LTS.

```bash
npm install
npm run dev
```

Comprobaciones:

```bash
npm run lint
npm run test
npm run build
npm run test:e2e
```

El build se genera en `dist`.

## Funciones principales

- Gestión de varios viajes, con viaje activo y estados Próximo, En curso, Finalizado y Archivado.
- Inicio con días restantes, próxima actividad, próximo vuelo, alojamiento, alertas y accesos rápidos.
- Itinerario editable, mapa, alojamientos, documentos, gastos, equipaje y recordatorios.
- Actividades enriquecidas con horario planificado, horario semanal por intervalos, fechas especiales, precios por tipo de viajero, reservas, accesibilidad, plan de lluvia y trazabilidad de la fuente.
- Alternativas separadas del plan principal y detección de huecos que propone búsquedas sin reordenar el día.
- Explorar por ciudad, zona, alojamiento, actividad, dirección, marcador o ubicación solicitada explícitamente.
- Búsquedas rápidas familiares y económicas, historial reciente, lugares guardados y alta directa como favorito, alternativa o actividad principal.
- Proveedores externos activables y ampliables: Google Maps, Apple Maps, Google, Tripadvisor, Civitatis, GuruWalk, GetYourGuide, Viator y webs oficiales.
- Vuelos iniciales VY8475 y U22315, con normalización de variantes como `U2 2315` y `EZY2315`.
- Horas programadas, estimadas y reales almacenadas por separado.
- Edición manual, historial inmutable, bandeja de alertas y detección de retrasos, cancelaciones, terminales y puertas.
- Conflictos visibles cuando un proveedor contradice un dato introducido por el usuario.
- Fuentes oficiales de aerolíneas y aeropuertos sin scraping.
- Asistente para revisar el impacto sobre el itinerario, sin modificar actividades sin confirmación.
- Copias completas con nombres `travelcaris-<viaje>-<fecha>.json`.

## Modo gratuito

TravelCaris funciona completamente sin API:

- muestra, crea y edita vuelos;
- conserva los datos y el historial manual en IndexedDB;
- abre los buscadores oficiales de Vueling, easyJet, Alicante, Gatwick y Luton;
- crea alertas internas a partir de cambios registrados;
- guarda billetes y tarjetas de embarque localmente;
- mantiene itinerario, mapas guardados, gastos, documentos y equipaje;
- no promete información automática en tiempo real.

Las búsquedas de lugares se abren en proveedores externos con texto correctamente codificado. TravelCaris no hace scraping ni intenta extraer contenido restringido. Cuando un proveedor no ofrece una URL de búsqueda estable, la app copia el texto de consulta antes de abrirlo. Horarios, precios y condiciones pueden caducar; cada ficha conserva fuente, estado y fecha de verificación y muestra un aviso según el umbral configurable.

En cada vuelo aparece el número y la fecha que deben introducirse si la fuente oficial no admite un enlace directo estable.

## Información automática de vuelos

La arquitectura incluye estos proveedores intercambiables:

- `ManualFlightStatusProvider`, activo por defecto.
- `AeroDataBoxFlightStatusProvider`, proveedor automático recomendado.
- `FlightAwareFlightStatusProvider`, alternativa.

El navegador consulta únicamente `/api/flights/status` y envía número de vuelo, fecha, origen y destino. La función de servidor valida esos campos, limita solicitudes, aplica un timeout, reutiliza respuestas durante cinco minutos y normaliza el resultado. Nunca recibe localizadores, pasajeros o números de billete.

La disponibilidad de terminal, puerta, cinta, matrícula y tiempos reales depende de la cobertura del proveedor y del aeropuerto. Confirma siempre con la aerolínea y las pantallas del aeropuerto. Consulta la documentación y precios actuales de [AeroDataBox](https://doc.aerodatabox.com/) y [FlightAware AeroAPI](https://www.flightaware.com/commercial/aeroapi).

## Variables de entorno

Copia `.env.example` solo como referencia para el entorno de servidor:

```env
FLIGHT_STATUS_PROVIDER=manual
AERODATABOX_API_KEY=
FLIGHTAWARE_API_KEY=
```

Para AeroDataBox:

```env
FLIGHT_STATUS_PROVIDER=aerodatabox
AERODATABOX_API_KEY=tu_clave_privada
```

Para FlightAware:

```env
FLIGHT_STATUS_PROVIDER=flightaware
FLIGHTAWARE_API_KEY=tu_clave_privada
```

No uses prefijos `VITE_`: Vite incrusta esas variables en JavaScript público. Las claves tampoco deben guardarse en React, IndexedDB, LocalStorage, el service worker o archivos de `public`.

Para desactivar por completo las consultas externas, establece `FLIGHT_STATUS_PROVIDER=manual` y deja desactivada la actualización automática en TravelCaris.

## Configurar el despliegue

El endpoint incluido en `api/flights/status.ts` sigue el formato de Vercel Functions.

Vercel:

1. Importa el repositorio desde GitHub.
2. Usa `Vite` como Framework Preset.
3. Usa `./` como Root Directory.
4. Usa `npm install` como Install Command.
5. Usa `npm run build` como Build Command.
6. Usa `dist` como Output Directory.
7. Despliega sin variables para mantener el modo manual gratuito.

`vercel.json` conserva las funciones de `/api` y envía el resto de rutas a `index.html`, por lo que las pantallas de React también funcionan al recargar una URL interna.

Para habilitar opcionalmente un proveedor automático:

1. Abre Project Settings > Environment Variables.
2. Añade `FLIGHT_STATUS_PROVIDER` y la clave del proveedor elegido.
3. Aplica las variables a Production y Preview según necesites.
4. Vuelve a desplegar.

Netlify:

1. Abre Site configuration > Environment variables.
2. Añade las mismas variables.
3. Adapta el pequeño handler de `api/flights/status.ts` al formato de Netlify Functions antes de publicar.

Cloudflare:

1. Abre Workers & Pages > Settings > Variables and Secrets.
2. Guarda la clave como Secret, no como variable pública.
3. Adapta el handler al formato de Worker manteniendo la interfaz de proveedores.

No configures dos proveedores a la vez. Las claves pueden generar costes; revisa cuota, precio, cobertura y límites en el panel del proveedor.

## Frecuencia de actualización

Cuando la actualización está habilitada y la app está abierta:

- más de 48 horas: manual;
- de 48 a 12 horas: cada 60 minutos;
- de 12 a 3 horas: cada 30 minutos;
- menos de 3 horas: cada 15 minutos;
- vuelo en curso: cada 10 minutos;
- aterrizado, finalizado o cancelado: se detiene.

Al abrir la app o volver al primer plano se consulta solo si el dato está caducado. El servidor reduce consultas repetidas con caché y agrupación de solicitudes. Una PWA cerrada no garantiza actualizaciones ni avisos sin una futura infraestructura push.

## Verificar que no hay claves en el cliente

Después de compilar:

```powershell
Get-ChildItem dist -Recurse -File |
  Select-String -Pattern 'AERODATABOX_API_KEY|FLIGHTAWARE_API_KEY|tu_clave_privada'
```

El comando no debe devolver coincidencias. Las pruebas también inspeccionan los archivos del cliente y fallan si encuentran nombres de claves privadas o variables `VITE_...API...KEY`.

## Datos, privacidad y copias

Viajes, vuelos, localizadores, billetes, documentos, búsquedas, favoritos e imágenes se guardan localmente en IndexedDB. Exporta copias periódicas desde Más > Ajustes. Conserva además los documentos esenciales en correo o Archivos del dispositivo.

El repositorio solo incluye zonas genéricas para los alojamientos de ejemplo. Las direcciones exactas, reservas y documentos privados se introducen en el dispositivo y no deben añadirse al control de versiones.

Safari puede liberar almacenamiento si el dispositivo necesita espacio o la web permanece mucho tiempo sin uso. TravelCaris no sustituye los sistemas oficiales y no debe ser la única copia de documentos esenciales.

## Instalar en iPhone

1. Publica la app mediante HTTPS.
2. Ábrela en Safari.
3. Pulsa Compartir.
4. Elige Añadir a pantalla de inicio.
5. Confirma el nombre TravelCaris.

La PWA incluye manifest, iconos TravelCaris, `apple-touch-icon`, service worker, caché del shell y página sin conexión.

## Pruebas del módulo de vuelos

La batería automática cubre normalización de Vueling y easyJet, proveedor simulado, errores, respuestas parciales, retrasos, cancelaciones, puerta, terminal, historial, alertas, protección de cambios manuales, caducidad, modo sin conexión, modo gratuito, ausencia de claves y reducción de consultas duplicadas. Ninguna prueba consume una API real.
