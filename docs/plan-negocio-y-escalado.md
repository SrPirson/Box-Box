# Box Box · Plan de negocio, escalado y producto

> 2026-10-05 · Investigación sobre `main` @ `1d319f8` sin tocar código. Hecha por cinco análisis en paralelo
> (escalado, mercado, monetización, venta, UX + pagos) y unificada aquí. Las cifras de mercado e ingresos son
> **estimaciones** con sus supuestos en cada parte; lo marcado **[verificar]** no se pudo confirmar en la web.

## Índice

- [Resumen ejecutivo](#resumen-ejecutivo)
- [Decisiones (y contradicciones resueltas)](#decisiones-y-contradicciones-resueltas)
- [Hoja de ruta unificada](#hoja-de-ruta-unificada)
- [Parte 1 · Mercado, competencia y viabilidad](#parte-1--mercado-competencia-y-viabilidad)
- [Parte 2 · Monetización y precios](#parte-2--monetización-y-precios)
- [Parte 3 · Cómo venderlo (go-to-market)](#parte-3--cómo-venderlo-go-to-market)
- [Parte 4 · Arquitectura y plan de escalado](#parte-4--arquitectura-y-plan-de-escalado)
- [Parte 5 · UX de Admin y Organizador + Pagos con Stripe](#parte-5--ux-de-admin-y-organizador--pagos-con-stripe)

---

## Resumen ejecutivo

1. **Es viable como negocio de nicho rentable, no como startup de hipercrecimiento.** Mercado direccionable estimado:
   ~100–160 k€/año en España, ~1,5–2 M€ en Europa, ~4–6 M€ en el mundo. España sola no da para un sueldo; Europa en
   inglés sí. Escenarios a 3 años: pesimista ~15 k€/año, base ~117 k€/año, optimista ~375 k€/año.
2. **Lo que nadie barato tiene es la capa del organizador**: banderas digitales con «visto por N/M», mapa con todos los
   coches y clasificación en vivo. Ahí está la diferenciación. El competidor más parecido (Citrus Racer, EE. UU.,
   beta privada) aún no la tiene: ventana estimada de **12–24 meses**.
3. **Paga el organizador; el equipo corre gratis dentro del evento.** Cada evento trae ~20 equipos sin coste de
   adquisición (efecto red). El dinero del primer año viene de organizadores, no de pilotos.
4. **Modelo: pase por evento + suscripción anual de temporada. Nada de «forever» para organizadores.** El coste de
   servidor por evento es de céntimos a 1–2 €, el margen bruto ~90–96 %.
5. **Pagos con Stripe** (Checkout + Billing + Customer Portal + Stripe Tax; Connect más adelante para inscripciones).
6. **Antes de cobrar a nadie** hay cuatro bloqueos: servidor de pago y **dominio propio** (la APK tiene fijado
   `boxracing.onrender.com`), banderas con **acuse** y persistidas, prueba en un **evento real** con 20+ móviles, y
   la parte legal mínima (privacidad/RGPD de ubicación, condiciones que digan que las banderas de la app no
   sustituyen a los comisarios, seguro de RC).
7. **Escalar técnicamente no es el problema ahora**: un proceso Node aguanta ~1.000 coches a 4 Hz en local
   (medido con PGlite en memoria). El primer techo es el **almacenamiento de telemetría** (3.600 filas/h por coche)
   y los límites del plan gratuito. Escalado horizontal (Valkey) solo cuando haya cientos de coches simultáneos.

## Decisiones (y contradicciones resueltas)

Los análisis no coincidían en tres puntos. Esta es la decisión recomendada:

| Tema | Lo que decía cada análisis | Decisión |
|---|---|---|
| **Primer nicho** | Venta: resistencia de **karting** (muchos eventos, 15–30 equipos, funciona solo con GPS). Mercado: resistencia amateur de **coches** (tienen OBD, relevos, la radio es cara; algunos reglamentos de karting prohíben radio/datos en vivo) | **Pilotos gratuitos en resistencia de karting** (acceso rápido, frecuentes, puedes correr tú como equipo), **confirmando el reglamento de cada organizador** antes. **Segmento de pago a medio plazo: resistencia de coches y track days**, donde el OBD y las banderas aportan más. Decidir el foco con datos en la revisión del día 90 (ene 2027) |
| **Precios del organizador** | Monetización: pase S/M/L 39/79/149 €, Club 390 €/año, Circuito 1.290 €/año. Venta: 49 € / 89 € por evento, temporada 390–790 € | **Tabla de la Parte 2** (39/79/149 €, Club 390 €/año, Circuito 1.290 €/año), sin IVA. Están en el mismo rango; se validan con los 3 primeros organizadores |
| **Pasarela de pago** | Monetización: **Paddle** (Merchant of Record, 5 % + 0,50 $, gestiona IVA/OSS por ti). UX/pagos: **Stripe** (~3,6 % con Stripe Tax, y el único que cubre suscripción + pase + Connect para inscripciones) | **Stripe**, como pensabas. Es más barato, encaja con el código y permite Connect. A cambio tú (o la gestoría) declaras el IVA OSS; Stripe Tax lo calcula. Paddle o Stripe Managed Payments solo si no quieres llevar el IVA en absoluto |
| **Licencia «forever»** | Monetización: no para organizadores; sí un **Fundador de por vida** para equipos (149 €, 100 plazas, con tope de uso) | De acuerdo. Para organizadores, como mucho un precio de fundador congelado en el plan anual |

Otros puntos a decidir tú (no técnicos):

- **Marca**: comprobar «Box Box» en OEPM/EUIPO antes de gastar en dominio y logo; propuesta «BoxBox Racing» con dominio propio.
- **Forma jurídica**: empezar como autónomo; SL cuando los ingresos lo justifiquen. VERI\*FACTU obligatorio en 2027 (01/01 para SL, 01/07 para autónomos): revisar con gestoría si las facturas de Stripe sirven.
- **iOS**: no hasta tener casos de éxito (el muro de BOX ya funciona en iOS por web; solo el móvil del coche exige Android).

## Hoja de ruta unificada

Esfuerzo en días de una persona que conoce el código. D = dificultad (B/M/A). Detalle de cada paso en su parte.

| Etapa | Fechas orientativas | Producto / técnica | D | Días | Negocio | Coste/mes infra |
|---|---|---|---|---|---|---|
| **0 · Listo para un evento real** | oct 2026 | Dominio propio y nueva APK apuntando a él · Render Starter · banderas con acuse, persistidas en BD y arreglos de Race Control (Parte 5, Fase 0) · límite de intentos de login · `INSERT` de muestras por lotes · CI con tests antes del deploy · backups · privacidad y condiciones | M | 6–8 | Revisar marca, lista de 50 organizadores, vídeo demo, correr tú como equipo | ~8 $ |
| **1 · Pilotos gratuitos** | nov–dic 2026 | Rutas y estados del evento, asistente de creación con checklist, **Race Control a pantalla completa**, resultados publicables (Parte 5, Fases 1–4) · stints y combustible · prueba de carga con 20+ clientes | M–A | 15–20 | 2–3 eventos piloto gratis, primer caso de éxito, Play Store (variante sin autoactualización) | ~8–25 $ |
| **2 · Cobrar** | ene–mar 2027 | **Stripe** (Checkout, Billing, Portal, Tax, webhooks, planes y límites; ~11 días) · admin con métricas, auditoría e impersonación (Parte 5, Fase 5) · Render Standard + Neon Launch · telemetría particionada con retención 90 días · métricas y alertas | M–A | 25–30 | Preventa Fundador, precios completos desde marzo, 4–5 organizadores de pago | ~50–80 $ |
| **3 · Crecer** | abr–sep 2027 | Inglés · página pública de liga y ranking · Equipo Pro · modo 24 h · Stripe Connect para cobrar inscripciones (~5,5 días) | M–A | 20–30 | Temporada alta, 24 h de verano como escaparate, Portugal/Francia/Italia, referidos | ~80–150 $ |
| **4 · Escala** | cuando haya cientos de coches simultáneos | Varias instancias con adapter Socket.IO sobre Valkey y estado en vivo compartido; después tiempo real en Fly.io con afinidad por evento | A | 15–50 | Federaciones, marca blanca, circuitos | 250 $ → 2 k$ |

**Regla de oro de producto**: el plan de pago nunca bloquea banderas ni tiempos en vivo a mitad de un evento.

---


# Parte 1 · Mercado, competencia y viabilidad


> Base: `docs/CONTEXTO.md` y `src/views` (Piloto, Box, Estadísticas, Eventos, Equipo, Ajustes, Mapa, Banderas, Admin), más búsqueda web. Las cifras sin fuente son **supuestos** y se marcan como tales. Los precios están en la moneda de la fuente.

### Qué es hoy el producto (lo que de verdad hay en el código)

- **Coche**: un móvil Android (APK Capacitor o Chrome) con GPS y, si se quiere, un ELM327 BLE o clásico. Manda posición, rumbo, rpm, temperatura del motor, batería y temperatura del móvil. Tiene cola sin conexión.
- **Muro de BOX** (navegador web): vueltas y parciales en directo, vuelta ideal, alarmas por niveles, mapa, mensajes al piloto (que este oye con TTS y contesta con OK/NO/PROBLEMA), 4 botones de piloto (Avería, Salgo a box, Repostar, Pinchazo) y flujo de boxes.
- **Organizador**: eventos con varios equipos, pista común, clasificación en vivo por sesión, mapa con todos los coches y **banderas digitales** (verde, amarilla, SC, roja, aviso) con acuse de «visto» por equipo.
- **Faltan** (está en la hoja de ruta): stints y combustible, delta en la vista Piloto, persistir mensajes y bandera, voz bidireccional (hoy es texto + TTS) e iOS para el coche.

---

## 1. Qué problema resuelve y para quién

**El problema**: en carreras de resistencia amateur, el muro no sabe qué pasa con su coche entre una vuelta y la siguiente. Hablar con el piloto cuesta entre 150 y 1.500 $ en radios, que además fallan. Y el organizador pequeño no puede pagar transponders, cronometraje ni un sistema de banderas digitales.

Box Box sustituye **radio + pizarra + telemetría básica + cronometraje ligero** por un móvil barato y un ELM327 de 10–20 €. Así se compara con lo que ya existe:

- **Radios**: un equipo «de marca» cuesta 700–1.500 $ o más, y 150–250 $ si lo montas tú ([nomoneymotorsports](https://nomoneymotorsports.com/2018/10/29/post-12-5-budget-friendly-race-radios/amp/), [HMS](https://www.hmsmotorsport.com/item/budget-radio-package/complete-radio-systems)). En EE. UU. además se necesita licencia de radioaficionado.
- **Cronometraje oficial**: un transponder MYLAPS TR2 cuesta 156–229 $ más **129,99 $/año** de suscripción ([Lucky Dog / MYLAPS](https://form.jotform.com/203557847384164), [Perry Auto](https://perryautolaval.com/products/mylaps-tr2-transponder)). Speedhive Live Timing para un organizador sin Orbits ronda **1.099 $/año** ([HS Sports](https://hssports.co.uk/sales/mylaps-speedhive-live-timing/)).
- **Telemetría en vivo hacia boxes**: RaceCapture/Track cuesta 519,95 $ y RaceCapture/Pro 690–900 $ ([Autosport Labs](https://www.autosportlabs.com/?p=12476)). Garmin Catalyst 2 cuesta 1.199,99 $ más 9,99 $/mes ([GRM](https://grassrootsmotorsports.com/news/new-garmin-catalyst-2-streamlines-everything-into-tidier-package/)).

### Segmentos: encaje y tamaño

**Cómo se calcula.** Contamos «equipos/coches activos al año» (la unidad que pagaría) y organizadores. ARPU supuesto: equipo **~120 €/año** (15 €/mes durante la temporada o pases por evento) y organizador **~500 €/año**.

| Segmento | Encaje con Box Box | España | Europa | Mundo | Datos y supuestos |
|---|---|---|---|---|---|
| **A. Resistencia amateur de coches** (tipo Lemons, ChampCar, C1, Fun Cup, 24 h de club) | **Muy alto**: coches de calle con OBD, relevos, boxes, estrategia y radios caras | **100–300 equipos** (supuesto: resistencias regionales y de club; el CER es semi-pro con TCR, [TCR Series](https://tcr-series.com/news/item/campeonato-de-espana-resistencia-begins-at-navarra)) | **2.000–3.500** | **6.000–9.000** | Lemons: 21–23 carreras/año y récord de 216 coches ([Wikipedia](https://en.wikipedia.org/wiki/24_Hours_of_Lemons), [citrus-racer](https://citrus-racer.com/)). ChampCar: ~24 eventos en 2026, ~8.000 inscripciones históricas y relevos de 1–2 h ([Wikipedia](https://en.wikipedia.org/wiki/ChampCar_Endurance_Series)). C1 Racing Club: media de 43 coches por parrilla y récord de 99 ([BRSCC](https://brscc.co.uk/?p=56527)). Fun Cup 25 h Spa: 120 coches y más de 500 pilotos ([Spa-Francorchamps](https://www.spa-francorchamps.be/en/news/21_the-25-hours-its-the-world-cup-of-the-vw-fun-cup)). Supuesto EE. UU.: 3.000–4.000 equipos únicos sumando Lemons, ChampCar, WRL, AER y Lucky Dog |
| **B. Resistencia en karting de alquiler** (SWS, 24 h karting de Barcelona o Spa) | **Medio-bajo**: sin OBD; pantalla y móvil en el kart a menudo prohibidos; el circuito ya da cronometraje | **1.200–2.400 equipos** (supuesto: >100 circuitos, el 40 % con resistencias y 30–60 equipos recurrentes cada uno) | **15.000–25.000** | **40.000–60.000** | SWS: 760 circuitos, 150.000 pilotos registrados y más de 20.000 eventos al año ([Sodi WS](https://www.sodiwseries.com/en-gb/news/sodi-world-series-a-record-breaking-2025-season-and-stronger-ambitions-for-2026-183.html)). España: >100 circuitos ([Motorpasión](https://www.motorpasion.com/otras-competiciones/los-22-mejores-circuitos-indoor-de-karts-en-espana)). 24 h Barcelona: equipos de 4–10 pilotos ([Kart360](https://kart360.com/news/crg-presents-the-24-hours-karting-of-barcelona)). Spa: dos 24 h en 2026 ([KartXpress](https://www.kartxpress.com/ReadMore/24-hours-spa-karting-twice-rather-than-once-in-2026)). ARPU realista: 3–8 € por evento |
| **C. Track days / tandas** (piloto individual) | **Bajo como app de piloto** (es una commodity de 9–28 € de pago único). **Alto como herramienta del organizador** (banderas y mapa) | 3.000–6.000 pilotos habituales (supuesto) y **30–60 organizadores** | ~50.000 pilotos y **300–500 organizadores** | — | MotorsportDays: >2.500 eventos de >70 organizadores en Europa ([MotorsportDays vía MarketIntelo](https://marketintelo.com/report/in-car-lap-timer-market)). Tandas en el Jarama de 89–299 € ([km77](https://www.km77.com/revista/?p=223)). SCCA: ~70.000 socios y >100.000 inscripciones al año ([SCCA](https://www.scca.com/articles/2020102-scca-member-anniversaries-december-2025)) |
| **D. Escuelas de pilotaje y coaching** | **Medio-alto** (B2B): el instructor ve en vivo a varios alumnos y les manda mensajes | 20–40 escuelas (supuesto) | 300–600 | — | Garmin Catalyst y VBOX venden coaching a 1.000–3.500 € por coche |
| **E. Circuitos y organizadores de eventos de club** | **Alto como «cronometraje ligero»** donde no compensa MYLAPS | 50–100 (karting + clubes) | 1.000+ | — | Licencias RFEDA de automovilismo: 20.427 en 2024, +21 % sobre 2023 ([CSD 2024](https://www.educacionfpydeportes.gob.es/eu/dam/jcr:8ebf13a7-f944-4705-8992-5fecec3ea89c/estadistica-de-deporte-federado-2024.pdf)). Motorsport UK: ~700 clubes y 30.000–64.000 licencias ([Autosport Int.](https://autosportinternational.com/newsroom/2024/11/08/meet-motorsport-uk-at-autosport-international/)) |
| **F. Regularidad y clásicos** | **Bajo ahora**: necesitan tripmaster, medias impuestas y precisión de centésimas en carretera abierta | Cientos de pruebas al año (reglamentos regionales, [Trofeo Madrileño de Regularidad](https://app-cdn.sportity.com/5efebdad-44eb-4edf-8ac0-a6d6b8b9e2c0/4d9ff610-138c-490e-8510-a31c21ad6a07_07_Reglam_REGULARIDAD_2025.pdf)) | — | — | Ya hay apps de tripmaster gratis o baratas ([Tripmaster GPS](https://apps.appfollow.io/ios/tripmaster-gps/1437574050?country=us)). Encajaría el seguimiento de coches por parte del organizador, no el cronometraje |
| eSports | Excluido | — | — | — | Pitwall.live ya es de SimGrid ([SimGrid](https://pits.thesimgrid.com/announcements/pitwall-live-joins-the-simgrid-family/)) |

**Tamaño en dinero (SAM, supuestos de ARPU arriba).**

| Ámbito | Segmento A | Segmento B | Segmentos C–E (organizadores y escuelas) | Total |
|---|---|---|---|---|
| España | 100–300 × 120 € = **12–36 k€** | 1.200–2.400 × 30 € = **36–72 k€** | ~100 × 500 € = **50 k€** | **~100–160 k€/año** |
| Europa | 2.000–3.500 × 120 € = **0,24–0,42 M€** | 15–25 k × 30 € = **0,45–0,75 M€** | ~1.500 × 500 € = **0,75 M€** | **~1,5–2 M€/año** |
| Mundo | 6–9 k × 120 € = **0,7–1,1 M€** | — | — | **~4–6 M€/año** |

**Lectura**: es un nicho pequeño. España sola no da para un negocio: como mucho para un proyecto paralelo rentable. Para pasar de cientos de miles de euros al año hacen falta el **inglés** (Reino Unido, EE. UU., Benelux) y vender a **organizadores y series**, no a equipos sueltos.

---

## 2. Competencia

| Producto | Qué hace | Precio | Modelo | Fortalezas frente a Box Box | Debilidades frente a Box Box |
|---|---|---|---|---|---|
| **RaceChrono Pro** | Cronómetro y registrador en el móvil, OBD y GPS externos, vídeo, >2.600 pistas | 19,99 $ pago único por plataforma ([App Store](https://apps.apple.com/app/id1129429340)) | App de pago único | Madura, análisis profundo, iOS y Android, base de pistas | Sin muro en vivo, sin mensajes, sin eventos ni organizador |
| **Harry's LapTimer** | Cronómetro predictivo, OBD, vídeo; Petrolhead añade vista online con amigos | 8,99 / 19,99 / 27,99 $ ([gps-laptimer](https://gps-laptimer.de/products)) | Pago único por edición | Predictivo, vídeo, gran base de pistas | La vista online es social, no un muro de boxes; sin banderas ni mensajes |
| **TrackAddict Pro** (HP Tuners) | Cronómetro, vídeo con datos, OBD; streaming a Live.RaceRender | 8,99 $ ([App Store](https://apps.apple.com/us/app/trackaddict-pro/id490135959)) | Pago único | Gratis o barato, ya tiene streaming en vivo | El streaming es para espectadores, sin comunicación ni gestión de equipo |
| **VRacer** (Velocity Software) | Telemetría OBD/CAN en vivo **a compañeros y boxes**, ghost, RaceBox y MyChron | Clubman 5,99 $/mes y Pro 17,99 $/mes ([App Store](https://apps.apple.com/app/id6756029509)) | Suscripción | **Competidor directo en telemetría a boxes**; iPad y Mac; hardware variado | Solo iOS/Mac; sin organizador, banderas ni mensajes con botones |
| **Citrus Racer** (antes «Lemons Racer») | Tableta Android en el coche, OBD, posición en carrera, bandera, **voz full-duplex por internet**, portal web de boxes | En pruebas privadas, sin precio ([citrus-racer.com](https://citrus-racer.com/)) | Por definir | **El clon conceptual más cercano**, con voz bidireccional y nicho Lemons en EE. UU. | Inmaduro; sin organizador multi-equipo propio; se apoya en el cronometraje oficial |
| **RaceCapture + Podium** (Autosport Labs) | Hardware de registro con LTE, Podium para ver en vivo, alertas y **mensajes de boxes al coche** | 350–900 $ de hardware ([ASL](https://www.autosportlabs.com/?p=12476)); Podium Pro de pago | Hardware + SaaS | Datos de calidad (CAN, 10–50 Hz), estrategia de resistencia, comunidad grassroots | Caro; instalación; no organiza eventos |
| **DriverMonitor** | Pantalla en el coche con posición, huecos y bandera desde el feed de Race Monitor | 11,99–34,99 $/semana o mes ([App Store](https://apps.apple.com/app/id1423694314)) | Suscripción (prueba que **se paga por resistencia**: 34,99 $/mes) | Usa el cronometraje oficial (posición real) | Solo iOS; sin telemetría ni mensajes de boxes |
| **Karting Pitboard** | El iPad hace de pizarra con mensajes al piloto | App barata ([App Store](https://apps.apple.com/mx/app/karting-pitboard/id6449951400)) | Pago o freemium | Encaja con reglamentos sin radio | Pizarra física digital, sin datos |
| **Creventic App / 992 Endurance Cup** | Chat oficial entre dirección de carrera y equipos, penalizaciones, repostajes ([App Store](https://apps.apple.com/app/id6450352954), [guía](https://992-endurance-cup.com/gfx/Guide_992_Endurance_Cup_app.pdf)) | Gratis para participantes | Lo financia el promotor | **Valida la idea de «dirección de carrera ↔ equipos» en el móvil** a nivel profesional | Hecha a medida para una serie, no vendible a otros |
| **AiM Solo 2 DL / MyChron 6 / SmartyCam 3** | Cronómetro y registrador de hardware (kart y coche), cámara con datos | Solo 2 DL: ~768 £; MyChron 6: ~516 £; SmartyCam 3: 800–846 € sin IVA ([Demon Tweeks](https://www.demon-tweeks.com/brand/aim/), [Xtra](https://xtramotorsport.com/product/aim-smartycam-3-sport/)) | Hardware | Estándar del sector, robusto, permitido en karting | Sin vivo hacia boxes (o con extras caros); sin comunicación |
| **Alfano 7** | Cronómetro GPS de kart a 25 Hz | ~504–605 € ([Demon Tweeks](https://www.demon-tweeks.com/eu/motorsport/kart-parts/lap-timers/?p=3)) | Hardware | Karting, precisión | Sin vivo ni equipo |
| **Racelogic VBOX** | Registrador a 10–20 Hz, predictivo, vídeo HD2 | 870 £ hasta ~3.564 £ ([GPR Direct](https://www.gprdirect.com/racelogic-vbox-data-logger-predictive-lap-timer/)) | Hardware | Precisión de referencia, coaching | Precio; sin comunicación |
| **Garmin Catalyst 2** | Coach por voz en tiempo real, vídeo, «vuelta ideal» | 1.199,99 $ + Vault 9,99 $/mes ([GRM](https://grassrootsmotorsports.com/news/new-garmin-catalyst-2-streamlines-everything-into-tidier-package/)) | Hardware + suscripción | Marca y experiencia de coaching | Individual, sin muro ni eventos |
| **RaceBox Mini / Mini S** | GPS de 25 Hz para el móvil | 223–349 $ ([Walmart](https://www.walmart.com/c/brand/racebox)) | Hardware | Mejora la precisión GPS del móvil | **Complemento** posible de Box Box, no rival |
| **MYLAPS (Orbits, Speedhive)** | Transponders, decodificadores, software y live timing | TR2 129,99 $/año; Speedhive LT 1.099 $/año ([HS Sports](https://hssports.co.uk/sales/mylaps-speedhive-live-timing/)) | Hardware + suscripción | **Cronometraje oficial**; Speedhive gratis para quien usa Orbits ([MYLAPS](https://www.mylaps.com/?p=3193)) | Caro para eventos pequeños; sin comunicación ni telemetría |
| **Race Monitor** | Live timing para el público | 0,99 $/mes o 4,99 $/año el espectador ([App Store](https://apps.apple.com/app/id404470174)) | B2C + organizadores | Ecosistema EE. UU. y API (DriverMonitor) | Solo resultados |
| **RaceHero** | Inscripciones, horarios, live timing; exclusivo de NASA ([MazdaRacers](https://mazdaracers.com/topic/5977-nasa-selects-racehero-as-exclusive-live-timing-results-service/)) | B2B | Acuerdos con series | Distribución por series | Sin telemetría ni comunicación |
| **Apex Timing** | Cronometraje y gestión de karting de alquiler y competición (FIA Karting, WSK), live timing compatible con todo ([Apex](https://www.apex-timing.com/en/live-timing/)) | B2B, a medida | Licencia al circuito | Dentro de los circuitos de karting europeos | No llega al coche ni a la comunicación con el equipo |
| **RaceFacer / BMI (SMS-Timing)** | Software de gestión y cronometraje para karting de alquiler, en 300+ circuitos cada uno ([RaceFacer](https://bmileisure.com/kart-timing-systems/), [BMI](https://www.bmileisure.com/en/sms-timing)) | RaceFacer 385–589 $/mes y módulo Race & Events 99 $/mes | SaaS para el circuito | Llave del canal de karting | Igual: no hay equipo ni muro |
| **Al Kamel Systems** (Barcelona) | Cronometraje de WEC, Le Mans e IMSA ([FIA WEC](https://www.fiawec.com/en/news/its-all-a-matter-of-timing-spotlight-on-al-kamel-systems/2231)) | Profesional | Contratos | Referente | Otro planeta de precio; no compite abajo |
| **Radios** (Racing Radios, Harris, Baofeng) | Voz entre piloto y boxes | 150–250 $ montada a mano; 700–1.500 $ de marca ([nomoneymotorsports](https://nomoneymotorsports.com/2018/10/29/post-12-5-budget-friendly-race-radios/amp/)) | Hardware | Latencia cero, no dependen de la cobertura, voz | Caras, licencia en EE. UU., sin datos |
| **«Móvil como radio»** (llamada o apps PTT) | Llamada o push-to-talk | Gratis | — | Coste cero | En el foro de Lemons dicen que funciona «un 66 % de las veces» y que «la cobertura es mala en muchos circuitos» ([foro Lemons](https://forums.24hoursoflemons.com/viewtopic.php?id=30179)) |

No he podido identificar sin ambigüedad «TSS» (no aparece como producto de cronometraje con ese nombre). «TrackDays» se trata como plataformas de reserva (MotorsportDays y organizadores), que son **canal**, no competencia.

---

## 3. Diferenciación, propuesta de valor y huecos

**Propuesta de valor (una frase):** «Radio, pizarra, telemetría básica y dirección de carrera para tu resistencia por 10 € de ELM327 y el móvil que ya tienes; y el organizador pone banderas, mapa y clasificación en cada coche sin transponders».

Lo que nadie junta hoy, comprobado en la tabla:

1. **Organizador + equipos en la misma herramienta.** Las banderas digitales con acuse por equipo, el mapa de todos los coches y la clasificación en vivo solo existen en apps propias de series profesionales (Creventic). VRacer, Citrus Racer y Podium no tienen esa capa.
2. **Mensajes estructurados pensados para conducir con guantes**: botones grandes, TTS, OK/NO/PROBLEMA, ENTRA YA con pulsación mantenida y boxes confirmados por BOX. Es más fiable que la voz con mala cobertura: un mensaje de pocos bytes llega cuando una llamada se corta.
3. **Precio de entrada casi cero** frente a los 350–1.200 $ de RaceCapture, Garmin o AiM.
4. **Web para el muro**: cualquier portátil o móvil, también iOS. Solo el teléfono del coche tiene que ser Android.

**Huecos de mercado**

- **«Cronometraje ligero» para eventos pequeños** (tandas, resistencias de club, quedadas de clásicos, karting propio): MYLAPS cuesta más de 1.000 $/año más transponders. El tiempo por GPS no es oficial, pero vale para no competitivos o como respaldo.
- **Banderas digitales para organizadores de tandas**: un aviso de bandera roja en todos los coches es un argumento de seguridad que se vende solo. Ojo: no sustituye a los comisarios (ver riesgos).
- **Resistencia amateur europea** (C1, Fun Cup, 2CV, 24 h de club, BMW E36/E46): no hay un Citrus Racer europeo.
- **Escuelas**: un instructor con 4–8 alumnos en pista y mensajes a cada uno.

**Lo que falta para que la diferenciación aguante**: stints y combustible (es el corazón de la resistencia), **ingesta del live timing oficial** (Race Monitor, Speedhive, Apex) para mostrar la posición real, voz bidireccional opcional, persistencia de mensajes y banderas, y un modo de baja cobertura.

---

## 4. Viabilidad

### DAFO

| **Fortalezas** | **Debilidades** |
|---|---|
| Coste de hardware mínimo (móvil + ELM327 de 10–20 €) | Precisión GPS del móvil (1 Hz de muestreo al organizador, 1–10 Hz de GPS) por debajo de AiM o VBOX: no es cronometraje oficial |
| Capa de organizador y banderas que no tiene ningún rival barato | El coche solo funciona con Android; iOS tiene el 31 % en España ([StatCounter](https://gs.statcounter.com/os-market-share/mobile/spain)) y más en Reino Unido y EE. UU. |
| Producto ya funcional (APK v13, 18 tests, despliegue) | Un solo desarrollador; Render free con una instancia y estado en memoria (sin alta disponibilidad el día de carrera) |
| Muro web multiplataforma | Sin stints, combustible, posición oficial ni voz; solo en español |
| **Oportunidades** | **Amenazas** |
| Resistencia amateur en crecimiento (licencias RFEDA +21 % en 2024; parrillas de C1 al alza) | **Citrus Racer** (mismo concepto, EE. UU.) y **VRacer** (telemetría a boxes) pueden añadir la capa de organizador |
| Alianzas con series o promotores (como Creventic, pero en marca blanca) | Reglamentos que prohíben radio o datos en vivo (karting) |
| Integración con RaceBox (25 Hz) y con feeds de live timing | Cobertura móvil en circuitos y congestión en grandes eventos |
| Vender a organizadores (B2B, ticket más alto, menos clientes que atender) | RaceChrono o Harry's pueden añadir un «modo equipo» con su base instalada |

### Riesgos concretos

| Riesgo | Gravedad | Detalle | Cómo mitigarlo |
|---|---|---|---|
| **Dependencia del OBD/ELM327** | Media | Los clones ELM327 son lentos (pocas PID por segundo) e irregulares. **Muchos coches de Lemons y ChampCar son anteriores al OBD2** (obligatorio en EE. UU. desde 1996 y en la UE desde 2001 en gasolina y 2004 en diésel). Los karts no tienen OBD | El modo «sin OBD» ya existe: posicionar Box Box como **GPS + comunicación primero** y el OBD como extra. Más adelante, sensores BLE baratos (temperatura de agua o aceite) |
| **iOS no soportado** | Media en España, alta en Reino Unido y EE. UU. | Afecta solo al teléfono del coche (el muro es web) | Recomendar un «Android dedicado de 100 €» que viva en el coche: es habitual en el sector (Citrus Racer pide una tableta Android). iOS nativo solo si la tracción lo justifica |
| **Reglamentos** | **Alta en karting**, baja en resistencia de coches | Hay resistencias de karting que prohíben **cualquier comunicación por radio** y solo permiten pizarra ([RAKC 6h](https://www.roadamerica.com/sites/main/files/file-attachments/rakc_auto_select_6-hour_briggs_206_endurance_-_official_rule_book_-.pdf?1772720884)). En karting de competición se prohíbe la **adquisición de datos en tiempo real** ([USPKS](https://www.uspks.com/documents/2024/03/tech-update-march-2024.pdf/), [TKART](https://tkart.it/en/magazine/expert-advice/data-acquisition-for-karts-guide-to-the-main-kart-telemetry-sensors-aim-mychron5s-2t-gps-dashboard-data-logger)). En Lemons las radios son libres y no están reguladas ([foro Lemons](https://forums.24hoursoflemons.com/viewtopic.php?id=429)) | Empezar donde se permite (resistencia de coches y tandas). En karting, vender **al organizador** (mapa, banderas, cronometraje) y ofrecer un modo «pizarra» sin datos al kart |
| **Banderas digitales y responsabilidad** | Media | Si una bandera roja no llega por falta de cobertura y hay un accidente, ¿quién responde? | Términos claros («complemento, no sustituye a comisarios ni luces»), acuse visible y registro auditable persistido (hoy está en memoria) |
| **RGPD y ubicación** | Media | La ubicación es dato personal ([RGPD art. 4](https://eur-lex.europa.eu/eli/reg/2016/679/oj)). Se rastrea en vivo a personas identificables y el organizador la ve. Hay menores en karting (en España el consentimiento propio es a partir de 14 años, [LOPDGDD art. 7](https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673)) | Base jurídica: ejecución del contrato (el servicio es el seguimiento) y consentimiento para lo demás. Rastrear solo en sesión, conservar poco, permitir borrar la cuenta (ya existe), DPA con Neon y Render (Frankfurt, UE: bien), aviso de privacidad y RAT. Estatus de encargado frente a organizadores |
| **Cobertura móvil** | Alta | «La cobertura es mala en muchos circuitos» ([foro Lemons](https://forums.24hoursoflemons.com/viewtopic.php?id=30179)) | Ya hay cola sin conexión y ráfaga. Mensajes pequeños; en el futuro, un router 4G/5G en el box o una SIM de otro operador |
| **Infraestructura** | Media | Render free se duerme; el estado en vivo es de una sola instancia | Plan Starter (~7 $/mes) desde el primer cliente de pago; persistir la bandera y los mensajes |

### Barreras de entrada

- **Para Box Box, bajas**: no exige hardware propio, la distribución por APK y web no depende de las tiendas, y los costes fijos son de decenas de euros al mes.
- **Para los rivales, también bajas.** El software es replicable (Citrus Racer lo demuestra). El foso real solo puede ser:
  1. **Red de organizadores y series**: si el evento usa Box Box, los equipos lo instalan.
  2. **Integraciones** (feeds de live timing, RaceBox).
  3. **Comunidad local** (España, Portugal y Latinoamérica en español).

### Escenarios a 1, 2 y 3 años

**Supuestos comunes**

- Plan Equipo: 15 €/mes en temporada (≈120 €/año) o 25 € por evento.
- Plan Organizador: 49 €/evento o 490 €/año.
- Escuela: 49 €/mes (≈490 €/año, con meses sin uso).
- Costes: 1.000–3.000 €/año entre infraestructura, cuentas de desarrollador, asesoría RGPD y seguro de RC. No incluyen el sueldo del fundador.

| Escenario | Año 1 (oct-26 a sep-27) | Año 2 | Año 3 | Supuestos |
|---|---|---|---|---|
| **Pesimista** | 15 equipos + 2 organizadores → **~3 k€** | 40 + 5 → **~7 k€** | 80 + 10 → **~15 k€** | Solo España, solo boca a boca, sin series. Abandono del 40 % al año |
| **Base** | 60 equipos + 5 organizadores + 1 escuela → **~10 k€** | 250 + 20 + 5 → **~43 k€** | 700 + 50 + 15 → **~117 k€** | Inglés en el año 1. Reino Unido y Portugal en el año 2. 1–2 series de club como socio. Penetración del ~3 % del SAM de coches en Europa y EE. UU. el año 3 |
| **Optimista** | 150 equipos + 10 organizadores + 1 serie → **~25 k€** | 800 + 50 + 1 acuerdo con una serie grande (tipo C1, Fun Cup o ChampCar) → **~120 k€** | 2.500 + 120 + 30 → **~375 k€** | Acuerdo de marca blanca o «app oficial» con un promotor, iOS nativo y live timing integrado. Penetración del ~10–15 % del SAM de coches + organizadores |

**Lectura**: el escenario base no da un sueldo hasta el año 3, y solo con internacionalización. El pesimista cubre costes, pero es un hobby. El optimista depende de **un único acuerdo con una serie**, que es el evento que mueve la aguja.

---

## 5. Veredicto

- **¿Merece la pena?** Sí, como **producto de nicho con coste marginal casi nulo**, porque ya está construido y funciona. **No** como startup de crecimiento financiada solo con el mercado español: el SAM en España es de ~100–160 k€/año, el europeo de ~1,5–2 M€ y el mundial de ~4–6 M€. El techo realista para un fundador solo está en **100–400 k€/año**, y exige inglés y acuerdos con series.
- **Por dónde empezar: resistencia amateur de coches** (tipo Lemons, ChampCar, C1 o Fun Cup, y sus equivalentes españoles de club). Es donde coinciden coche con OBD, relevos, boxes, radio cara, reglamentos permisivos y disposición a pagar (DriverMonitor cobra 34,99 $/mes en resistencia).
- **Vender por el organizador**, no por el equipo: 1 organizador = 20–100 equipos. Hay que ofrecer gratis o barato la capa «banderas + mapa + clasificación» a 2–3 promotores españoles de resistencia o tandas (Jarama, Navarra, MotorLand, Calafat) a cambio de exigir o recomendar la app a sus equipos.
- **Karting de alquiler: solo como B2B del circuito** (mapa y banderas), no dentro del kart, porque los reglamentos y la ausencia de OBD juegan en contra.
- **Prioridad de producto antes de cobrar**:
  1. Stints y combustible.
  2. Persistencia de banderas y mensajes, y plan de pago en Render.
  3. Interfaz en inglés.
  4. Integrar el live timing oficial (posición real).
  5. Modo de baja cobertura.
  6. iOS al final.
- **Vigilar a Citrus Racer** (mismo concepto, EE. UU., en beta) y a **VRacer**. La ventaja de Box Box es la capa de organizador y moverse primero en Europa en español e inglés, y esa ventana es de 12–24 meses.

---

# Parte 2 · Monetización y precios


> Fecha: 2026-10-05. Base: `docs/CONTEXTO.md` (roles admin ⊃ organizador ⊃ piloto, eventos con varios equipos,
> clasificación en vivo, mapa, banderas, telemetría OBD+GPS, comunicación piloto-box). Precios en EUR.
> Cifras de terceros con fuente al final; lo que es estimación propia va marcado como **(est.)**.

### Resumen ejecutivo

- **No elegir uno de los tres modelos puros.** El que paga es el **organizador** (B2B, valor por evento) y el que
  genera volumen y viralidad es el **equipo** (B2C/prosumer, barato y gratis en eventos).
- **Organizadores**: pase por evento como puerta de entrada y **suscripción anual** («Club») para quien hace
  más de ~6 eventos al año. Ningún «forever» para organizadores.
- **Equipos**: **gratis para siempre dentro de un evento** (el organizador ya ha pagado) y plan **Equipo Pro**
  barato (49 €/año IVA incl.) para entrenar con histórico y análisis.
- **Lifetime solo como early-bird limitado para equipos** (100 plazas, uso razonable), nunca para organizadores.
- La métrica de valor es **equipos por evento**, no horas: la infraestructura cuesta céntimos por hora-equipo
  (ver §3), así que las horas solo sirven como tope antiabuso.
- Cobrar al principio con un **Merchant of Record** (Paddle) para no tener que gestionar IVA/OSS/facturas a
  clientes; pasar a Stripe cuando haya volumen o se cobren inscripciones (Stripe Connect).

---

## 1. Qué cobra el mercado (comparables)

| Producto | Qué es | Precio público | Modelo | Lectura para Box Box |
|---|---|---|---|---|
| **MYLAPS Speedhive** (live timing para clubs) | Live timing online del cronometraje con transpondedor | **1.099 $/año** por club | Suscripción anual B2B | Ancla directa para el plan de circuito/promotor |
| **MYLAPS transponder TR2** | Transpondedor del piloto | **129,99 $/año** de suscripción por transpondedor; 30 TR2 con 2 años: **3.446 € + IVA** | Suscripción por piloto | Los pilotos **ya pagan cada año por cronometrarse**; 49 €/año no es extraño |
| **MYLAPS Orbits 5** | Software de cronometraje | Incluido gratis al comprar 30 TR2 con 2 años | Software «regalado» con hardware | El software se monetiza vía hardware/suscripción |
| **Apex Timing** (GoRacing, Live Timing) | Cronometraje de karting de competición y alquiler | **Sin precio público**, presupuesto a medida; presume de «sin coste por socio ni comisión» | Licencia/contrato B2B | No compite en precio: compite en homologación. Box Box no es cronometraje oficial |
| **Race Monitor** | App de espectador/live timing | **0,99 $/mes o 4,99 $/año** (Plus aparte) | Suscripción B2C mínima | Al espectador no se le cobra casi nada: **no cobrar al público** |
| **RaceHero** | Live timing, horarios y resultados (NASA, USPKS) | Sin precio público; acuerdos con series | B2B con series/federaciones | El canal federación/serie existe y es exclusivo |
| **Podium / AutosportLabs** | Telemetría en vivo + hardware | PodiumConnect **349,95 $**, RaceCapture/Pro **649,95 $**; streaming «gratis», plan Pro de estrategia de pago | Hardware con margen + freemium | Modelo «hardware + nube freemium» probado en el nicho |
| **RaceChrono Pro** | Lap timer + OBD + vídeo | **19,99 $ iOS / 18,99 $ Android**, pago único | Licencia perpetua | El piloto está acostumbrado a pagar ~20 € **una vez** por una app sin servidor |
| **Harry's LapTimer** | Lap timer | Rookie **8,99 $**, Petrolhead **19,99 $**, Grand Prix **27,99 $**; **Togo 4,99 $/día o 12,99 $ 3 días** | Pago único + pase por día | El «pase de fin de semana» existe y funciona para el ocasional |
| **TrackAddict Pro** | Lap timer + OBD | **8,99 $** pago único | Licencia perpetua | Suelo de precio del lap timer B2C |
| **MotorsportReg** | Inscripciones de eventos de motor | **0 € al organizador**; **2 $ por inscripción** al participante | Comisión fija por inscripción | La inscripción paga el software del organizador |
| **RunSignup** | Inscripciones deportivas | **6 % + 1 $** por carrito (<250 $), 5 % + 1 $ (250–999 $), 4 % + 1 $ (≥1.000 $) | Comisión % | Techo de comisión aceptado en deporte popular |
| **Eventbrite (España)** | Entradas | **6 %** (Essentials) o **9 % + 0,19 €** (Professional) por entrada | Comisión % | Techo de comisión aceptado en eventos |

Conclusiones del mercado:

1. **Las apps de piloto sin servidor se venden a pago único (9–28 $).** Box Box tiene servidor y comunicación en
   vivo, lo que justifica suscripción, pero el ancla mental del piloto es baja: el Pro de equipo tiene que costar
   «lo de un lap timer al año», no más.
2. **El cronometraje/live timing B2B se paga por año (~1.100 $) o con hardware.** El organizador serio ya paga
   por esto; Box Box añade mapa, banderas y radio de datos piloto-box, que el live timing no tiene.
3. **Las plataformas de inscripción cobran al participante (2 $ o 4–9 %).** Es la vía para que el organizador
   pague 0 €.
4. Matiz de posicionamiento: Box Box cronometra por **GPS**, no con transpondedor homologado. Venderlo como
   **complemento** (estrategia, comunicación, seguimiento, banderas «digitales» de apoyo) y no como sustituto del
   cronometraje oficial ni de los comisarios. Esto también limita la responsabilidad legal (§4).

---

## 2. Tabla comparativa de modelos

Leyenda: ▲ favorable · ● neutro · ▼ desfavorable.

| Modelo | Caja | Churn | Coste servidor vs. ingreso | Estacionalidad | Encaje con el cliente | Complejidad | Veredicto |
|---|---|---|---|---|---|---|---|
| **A. Suscripción mensual organizador** | ● Ingreso pequeño y regular | ▼ Alto: se dan de baja en invierno y se re-suscriben en marzo | ▲ Fijo, cubre el coste base | ▼ Muy expuesta | ● Bueno para clubs con eventos frecuentes; malo para quien hace 2–4 al año | ● Billing recurrente | Solo como opción secundaria del anual |
| **B. Anual con descuento (≈2 meses gratis)** | ▲ Cobro por adelantado en pretemporada | ▲ Bajo (renovación 1 vez/año) | ▲ | ▲ Neutraliza el invierno | ▲ Clubs, ligas, campeonatos con calendario | ● | **Sí: plan principal para organizadores recurrentes** |
| **C. Pago por evento** | ● Irregular, concentrado en temporada | ▲ No hay churn: hay «recompra» | ▲▲ Ingreso alineado 1:1 con el coste (horas de telemetría) | ● Ingreso estacional pero sin bajas | ▲▲ Encaja con cómo piensa el organizador («coste por carrera», se repercute en la inscripción) | ▲ Simple | **Sí: puerta de entrada** |
| **D. Bonos/créditos de eventos** | ▲ Prepago | ▲ El crédito no gastado ata | ▲ | ▲ Se compran en pretemporada | ▲ Promotores con 3–10 eventos/año | ● Gestión de caducidad | **Sí, como descuento por volumen del pase** |
| **E. Licencia de por vida («forever») organizador** | ▲▲ Un pico de caja | ● «Churn 0» pero también ingreso 0 | ▼▼ Cada evento futuro cuesta servidor y soporte y no paga nada | ▼ Pagado una vez, consume cada temporada | ▼ Los organizadores grandes son justo los que más consumen | ▲ | **No** |
| **F. Lifetime early-bird limitado (equipos)** | ▲ Caja para financiar la temporada 1 | ● | ● Asumible si hay tope de uso y el coste por hora es de céntimos | ● | ▲ Al piloto le gusta el pago único (RaceChrono, Harry's) | ▲ | **Sí, 100 plazas, con uso razonable** |
| **G. Freemium para equipos** | ▼ Ingreso 0 directo | n/a | ● Coste bajo pero no nulo (almacenamiento acumulado) | n/a | ▲▲ Imprescindible: el organizador no puede invitar a equipos que tengan que pagar | ▲ | **Sí, obligatorio** |
| **H. Equipo Pro (anual/mensual)** | ● Pequeño por cliente, suma en volumen | ● Medio; menor en anual | ▲ | ● Se entrena todo el año, más en primavera | ▲ Equipos de resistencia, track-days, karting amateur | ● | **Sí** |
| **I. Comisión por inscripción cobrada en la app** | ▲ Escala con el tamaño del evento | ▲ Vinculado al uso real | ▲▲ | ● | ▲ El organizador paga 0 € y el participante ve un «gasto de gestión» normal | ▼ Pagos de terceros, reembolsos, facturación, PSD2 (vía Stripe Connect) | **Fase 2 (2027-T3)**, cuando haya organizadores |
| **J. White-label / patrocinios (circuitos, federaciones)** | ▲▲ Contratos grandes anuales | ▲▲ Muy bajo | ▲ | ▲ | ▲ Circuitos con escuela/track-days, federaciones autonómicas | ▼ Venta larga, personalización | **Sí, a medida y a partir del año 2** |
| **K. Hardware OBD con margen** | ● Margen bajo en euros | n/a | n/a | ● | ● Quita fricción (adaptadores clónicos que no funcionan) | ▼ Stock, envíos, garantías, devoluciones | **Solo enlaces de afiliado / «kit recomendado»**; no stock |

### Análisis en detalle de los tres modelos que plantea el fundador

#### Suscripción mensual (organizador)

- **Pros**: MRR predecible; fácil de entender para un SaaS; cubre el coste fijo de servidores.
- **Contras**: el organizador típico de karting/track-day **no piensa en meses, piensa en carreras**. Con una
  temporada de marzo a noviembre, el mensual invita a cancelar en diciembre y volver en marzo: churn «técnico»
  del 25–40 % anual solo por estacionalidad **(est.)**. Para quien hace 3 eventos al año, 12 cuotas parecen caras.
- **Caja**: goteo; nada por adelantado.
- **Coste de servidores**: el coste variable (horas de telemetría) va por eventos; el mensual lo cubre de sobra
  porque el coste por hora es mínimo (§3). El riesgo no es de coste sino de **ingreso**.
- **Encaje**: bueno solo para clubs con eventos casi semanales (ligas de karting de alquiler, escuelas).
- **Veredicto**: ofrecer el mensual como opción, pero **empujar el anual** (2 meses gratis) y permitir
  **pausar** la suscripción en invierno en vez de cancelar (pausa = conserva datos y precio, no cobra).

#### Pago por evento

- **Pros**: alinea precio con valor («esta carrera tiene 20 equipos, me cuesta 79 €, lo repercuto 4 € por
  equipo en la inscripción») y con coste (horas de telemetría). Cero fricción de compromiso. Muy fácil de vender
  a un organizador nuevo.
- **Contras**: ingreso irregular y difícil de prever; cada evento es una decisión de compra (posibilidad de
  «este lo hago sin app»); no hay MRR que enseñar.
- **Caja**: concentrada en temporada; se suaviza con **bonos prepago** comprados en pretemporada.
- **Churn**: no hay bajas, hay recompras; la métrica es «eventos por organizador y año».
- **Encaje**: el mejor para organizadores esporádicos, promotores de una carrera grande (24 h, 6 h) y
  para el primer contacto con cualquiera.
- **Veredicto**: **puerta de entrada** y precio de referencia; el anual se vende como «más barato a partir de
  6 eventos al año».

#### Licencia de por vida («forever»)

- **Pros**: pico de caja inmediato; argumento de venta fuerte para el early adopter; sin churn.
- **Contras**: Box Box **no es un software local**: cada evento futuro consume servidor (WebSocket, Postgres,
  ancho de banda) y soporte en directo un sábado. Un organizador lifetime que hace 20 eventos/año durante 5 años
  es coste puro. Destruye el MRR/ARR (valoración y financiación) y ancla el precio futuro a la baja.
  Además, los clientes que más compran lifetime son los que más usan (selección adversa).
- **Caja**: buena el mes 1, nula después; si se vende demasiado, financia el año 1 a costa del año 3.
- **Encaje**: aceptable solo para **equipos** (consumo bajo y predecible) y **limitado en número y uso**.
- **Veredicto**: **No para organizadores.** Sí un **«Fundador» de equipo** limitado (100 plazas) con tope de uso
  razonable y explicitado en las condiciones (p. ej. 200 h de telemetría al año, 1 coche).

---

## 3. Recomendación: planes y precios

Principios:

1. **El equipo nunca paga para correr en un evento.** Si un organizador invita a 25 equipos, los 25 entran gratis
   con todas las funciones de evento (Piloto, Box, mensajes, banderas, clasificación). Si no, el organizador no
   adopta la app.
2. **La métrica de valor del organizador = nº de equipos por evento** (escala con lo que él ingresa por
   inscripciones). Las horas son un tope antiabuso, no la métrica.
3. **Precios redondos, pocos planes, anual con 2 meses gratis.**
4. **B2B se anuncia sin IVA; B2C (equipos/pilotos) con IVA incluido** (obligatorio mostrar precio final al
   consumidor). IVA España 21 %.

### 3.1 Organizadores

| Plan | Para quién | Precio sin IVA | Precio con IVA (21 %) | Límites |
|---|---|---|---|---|
| **Paddock** (gratis) | Probar, quedadas entre amigos, una tanda de entrenamiento | 0 € | 0 € | 1 evento activo a la vez · **hasta 5 equipos** · 3 h de telemetría por sesión, 10 h/evento · histórico del evento **30 días** · sin dirección de carrera (banderas solo verde/roja) · «Powered by Box Box» |
| **Pase Evento S** | Carrera pequeña, track-day de club | **39 €** | **47,19 €** | **hasta 10 equipos** · 1 día · hasta 12 h de telemetría · todas las funciones (banderas completas, mapa, clasificación por sesión) · histórico **1 año** |
| **Pase Evento M** | Resistencia 4–6 h, liga de karting | **79 €** | **95,59 €** | **hasta 25 equipos** · hasta 2 días · 24 h de telemetría · pantalla pública de clasificación · export CSV · histórico 1 año |
| **Pase Evento L** | 12 h / 24 h, eventos grandes | **149 €** | **180,29 €** | **hasta 60 equipos** · hasta 3 días · 48 h · todo lo anterior + soporte prioritario el día del evento |
| Equipo extra sobre el límite | | 3 €/equipo | 3,63 € | — |
| **Bono 5 eventos M** | Promotor con calendario | **316 €** (paga 4) | **382,36 €** | 5 pases M, caducan a 18 meses; se pueden aplicar como 2 S = 1 M |
| **Club** (mensual) | Ligas y clubs con eventos frecuentes | **39 €/mes** | **47,19 €/mes** | Eventos **ilimitados de hasta 25 equipos** · 400 horas-equipo/mes (uso razonable) · 2 cuentas de staff · histórico **2 años** · pausa invernal (hasta 4 meses/año sin cobro) |
| **Club** (anual) | Lo mismo, pagado en pretemporada | **390 €/año** (2 meses gratis) | **471,90 €/año** | Igual que mensual |
| **Circuito / Promotor** (anual) | Circuitos con track-days y escuela, promotores de campeonato | **1.290 €/año** (o 129 €/mes) | **1.560,90 €/año** (156,09 €/mes) | Eventos ilimitados de **hasta 60 equipos** · 1.500 horas-equipo/mes · 5 staff · **marca propia** (logo y colores en Piloto/Box, subdominio) · pantalla TV de clasificación · histórico ilimitado · soporte con teléfono los días de evento |
| **Federación / White-label** | Federaciones autonómicas, series monomarca | **desde 3.000 €/año** | **desde 3.630 €/año** | A medida: varias organizaciones, marca completa, licencias para los clubs federados, formación |

Justificación de cada precio:

- **Paddock gratis**: sin un plan gratis real el organizador no prueba; con 5 equipos no sirve para una carrera de
  pago (que suele tener 10+), así que no canibaliza. Coste: céntimos (§4).
- **Pase S 39 €**: menos de lo que cuesta una sola inscripción de un equipo en una carrera de resistencia amateur
  **(est.)**; repercutido son ~4 €/equipo. Es el precio de «no hace falta pedir permiso a nadie».
- **Pase M 79 €**: 20–25 equipos → **3–4 €/equipo**, del orden de la comisión fija de MotorsportReg (2 $/inscripción)
  y muy por debajo del 6 % de Eventbrite sobre una inscripción típica. El organizador lo repercute sin notarse.
- **Pase L 149 €**: una 24 h tiene 30–60 equipos y 24 h+ de telemetría; 2,5–5 €/equipo, el coste real sube
  (más horas, más soporte), por eso no es lineal pero sí mayor.
- **Club 390 €/año**: equivale a ~5 pases M. Cruza al pase por evento a partir del **6.º evento al año**:
  el organizador recurrente «gana» pasando al anual. Queda claramente por debajo de Speedhive (1.099 $/año), que
  solo da live timing.
- **Circuito 1.290 €/año**: anclado a Speedhive (~1.100 $/año) pero con marca propia, mapa, banderas y
  comunicación de equipos; un circuito lo amortiza con 1–2 track-days. El mensual (129 €) es un 20 % más caro a
  propósito para empujar el anual.
- **Federación desde 3.000 €**: contrato anual con personalización; por debajo de lo que cuesta un kit de
  transpondedores de club (3.446 € + IVA por 30 TR2 con 2 años), así que no asusta en un presupuesto federativo.

### 3.2 Equipos y pilotos

| Plan | Precio IVA incl. | Sin IVA | Qué incluye |
|---|---|---|---|
| **Piloto** (gratis) | 0 € | 0 € | **Todo dentro de eventos** (gratis siempre) · entrenamiento libre con 1 equipo y 1 coche · Box en **2 dispositivos** · mensajes y alertas básicas · estadísticas de las **últimas 10 sesiones** · telemetría cruda de **30 días** (las vueltas y tiempos se guardan siempre) · 20 h/mes de telemetría en libre |
| **Pase fin de semana** | **9,99 €** | 8,26 € | Todo lo de Pro durante 72 h (como el «Togo» de Harry's). Para el que va a 2–3 track-days al año |
| **Equipo Pro** (mensual) | **5,99 €/mes** | 4,95 €/mes | Histórico **ilimitado** · estadísticas avanzadas (vuelta ideal, constancia, comparativa entre pilotos y sesiones, tramos) · stints y combustible (cuando exista) · alertas avanzadas por niveles · Box en **dispositivos ilimitados** · export CSV · pistas guardadas ilimitadas · 150 h/mes de telemetría |
| **Equipo Pro** (anual) | **49 €/año** | 40,50 €/año | Igual (≈ 4 meses gratis respecto al mensual) |
| **Fundador** (lifetime, solo 100 plazas, solo hasta el 28/02/2027) | **149 €** pago único | 123,14 € | Equipo Pro de por vida para 1 equipo/1 coche · uso razonable 200 h/año de telemetría · nombre en «Fundadores» · acceso anticipado. Condiciones: «de por vida del producto», no transferible |

Justificación:

- **Gratis en eventos**: el efecto red es el motor de captación (un evento de 20 equipos = 20 instalaciones y
  60–80 usuarios, entre pilotos y box). Cobrar ahí rompería la venta al organizador.
- **49 €/año**: el piloto ya paga 129,99 $/año por un transpondedor MYLAPS y 19–28 $ por un lap timer de pago
  único sin servidor. 49 €/año es «un lap timer al año» con servidor, radio de datos y equipo compartido.
  Más de 60 €/año choca con el ancla de pago único de RaceChrono/Harry's.
- **5,99 €/mes**: hace el anual muy atractivo (12 × 5,99 = 71,88 €), y sirve al que solo corre unos meses.
- **Pase 9,99 €**: precio mínimo razonable con Merchant of Record (Paddle pide precio a medida por debajo de 10 $)
  y captura al ocasional que nunca se suscribiría.
- **Fundador 149 €**: ≈ 3 años de Pro. Con un coste de infraestructura de céntimos por hora (§4), 200 h/año cuestan
  < 2 €/año: el lifetime **sale rentable** aunque dure 10 años. Limitarlo a 100 plazas evita el problema de
  «deuda de lifetime» y crea urgencia.
- **Limitación iOS**: la app no funciona en iOS (Web Bluetooth y APK solo Android). Hasta resolverlo, el Box
  (portátil/web) sí funciona en cualquier sistema, pero el móvil del coche tiene que ser Android: decirlo en la
  página de precios y en el checkout para evitar reembolsos.

### 3.3 Lo que queda fuera de los planes (y cuándo)

- **Comisión por inscripción (fase 2, 2027-T3)**: el organizador cobra la inscripción en la app con
  Stripe Connect. **Tarifa: 2,5 % + 0,50 € por inscripción, pagada por el participante** (o por el organizador si
  lo prefiere). Coste Stripe ~1,5 % + 0,25 € (tarjeta EEE estándar) → margen ~1 % + 0,25 €. Gancho comercial:
  **si cobras con Box Box las inscripciones de un evento, el pase de ese evento es gratis.** Es lo que hace
  MotorsportReg y convierte el pase en un coste 0 para el organizador.
- **Patrocinio**: espacio «Presentado por …» en la pantalla de clasificación y en la franja de banderas, vendido
  por el organizador/circuito (no por Box Box) dentro del plan Circuito. Box Box no vende publicidad propia:
  una pantalla de seguridad (banderas) con anuncios de terceros es mala idea.
- **Hardware**: no tener stock. Página «Adaptadores probados» con enlaces de afiliado (ELM327 Bluetooth
  clásico/BLE probados con la app, soporte de móvil, cargador). Revisar en 2028 un **kit propio** (adaptador
  probado + soporte + cable) a ~39 € IVA incl. si el soporte por adaptadores clónicos se vuelve un problema.

---

## 4. Unit economics

### 4.1 Coste de infraestructura (est., con precios públicos de Render y Neon)

Supuestos (a medir en producción): el coche envía telemetría con varios mensajes por segundo; el servidor guarda
muestras a **1 Hz** y reenvía a la sala del equipo (2–4 dispositivos de box) y un resumen a 1 Hz al organizador.

| Concepto | Estimación por hora-equipo | Precio unitario | Coste por hora-equipo |
|---|---|---|---|
| Tráfico (subida + reparto a box + organizador + overhead de Socket.IO) | ~15–25 MB | Render 0,15 $/GB por encima del incluido | **~0,003 $** |
| Almacenamiento de muestras a 1 Hz (3.600 filas + índices) | ~1 MB | Neon 0,35 $/GB-mes | ~0,0004 $/mes (acumulativo) |
| CPU (proceso Node compartido) | marginal | Instancia fija | ~0 |

| Escenario | Horas-equipo | Coste variable |
|---|---|---|
| Evento M (20 equipos × 6 h + entrenos) | ~150 | **~0,5–1 €** de tráfico + ~0,05 €/mes de almacenamiento (+ cómputo Neon ~0,10 $/CU-h durante el evento si el plan es por uso) → **≈ 1–2 € por evento** |
| Evento L (50 equipos × 24 h) | ~1.200 | **≈ 5–8 €** |
| Equipo Pro entrenando 50 h/año | 50 | **< 0,5 €/año** |

**Coste fijo mensual mínimo para cobrar** (sin dormirse, que el plan gratis de Render se duerme a los 15 min):

| Partida | €/mes (est.) |
|---|---|
| Render workspace Pro (25 $) + instancia Standard 1 CPU/2 GB (25 $) | ~45 € |
| Neon Launch (cómputo por uso + almacenamiento) | ~15–30 € |
| Dominio, correo, monitorización, copias | ~15 € |
| **Infraestructura** | **~75–90 €** |
| Gestoría/software de facturación Verifactu | ~50–100 € |
| Cuota de autónomo (tarifa plana 2026: 88,64 €; general ~205 €+) | 89–205 € |
| **Total fijo** | **~215–395 €/mes** |

Conclusión: **la telemetría en vivo no es el coste que importa** (céntimos por hora-equipo). Lo que importa son
el coste fijo, el **soporte en directo los días de carrera** (fines de semana) y el **almacenamiento acumulado**
de muestras crudas → por eso el plan gratis retiene la telemetría cruda 30 días y guarda para siempre solo las
vueltas y los tiempos (ligeros). Límite técnico real: una sola instancia con el estado en memoria; hay que medir
cuántos coches aguanta una instancia de 1 CPU antes de vender el Pase L con 60 equipos.

### 4.2 Margen por producto

| Producto | Ingreso neto (sin IVA) | Pasarela (Paddle 5 % + 0,50 $ / Stripe ~1,5 % + 0,25 €) | Infra variable | **Margen de contribución** |
|---|---|---|---|---|
| Pase S | 39 € | 2,4 € / 0,8 € | ~0,5 € | **~36–38 € (92–96 %)** |
| Pase M | 79 € | 4,4 € / 1,4 € | ~1,5 € | **~73–76 € (92–96 %)** |
| Pase L | 149 € | 7,9 € / 2,5 € | ~7 € | **~134–140 € (90–94 %)** |
| Club anual | 390 € | 20 € / 6 € | ~15 €/año | **~355–370 € (91–95 %)** |
| Circuito anual | 1.290 € | 65 € / 20 € | ~60 €/año | **~1.165–1.210 € (90–94 %)** |
| Equipo Pro anual | 40,50 € | 2,5 € / 0,9 € | ~0,5 € | **~37–39 € (92–96 %)** |
| Equipo Pro mensual | 4,95 € | 0,7 € / 0,32 € | ~0,05 € | **~4,2–4,6 € (85–93 %)** |
| Fundador | 123,14 € | 6,6 € / 2,1 € | ~1,5 €/año | **~115 € el año 1** |

(El mensual de 4,95 € es donde más pesa la tarifa fija de la pasarela: otra razón para empujar el anual.)

### 4.3 CAC, LTV y punto de equilibrio (est.)

**Captación**: venta del fundador a organizadores (llamadas, visitas a circuitos, primer evento gratis
acompañado) + bucle viral equipo→organizador. No hay presupuesto de anuncios al principio.

| Segmento | CAC estimado | Supuestos de retención | LTV (margen) | LTV/CAC |
|---|---|---|---|---|
| Organizador por eventos | 150–300 € (tiempo, viajes, un evento gratis) | 5 eventos/año × 79 € × 3 años | ~1.100 € | **4–7×** |
| Organizador Club anual | 200–400 € | Renovación anual 75 % → vida media 4 años | ~1.450 € | **4–7×** |
| Circuito | 500–1.000 € (venta más larga) | Renovación 85 % → ~6 años | ~7.000 € | **7–14×** |
| Equipo Pro | 0–10 € (llega desde un evento) | Renovación 60 % → ~2,5 años | ~95 € | **>10×** |

Reglas prácticas: mantener **LTV/CAC > 3** y **recuperar el CAC en < 12 meses** (un Club anual lo recupera el
día 1 por el cobro por adelantado).

**Punto de equilibrio**:

- **Sin sueldo del fundador** (cubrir ~300 €/mes de fijo ≈ 3.600 €/año): por ejemplo **4 Club anuales
  (1.560 €) + 15 pases M (1.185 €) + 25 equipos Pro (1.010 €)** ≈ 3.750 €/año. Alcanzable en la temporada 2027.
- **Con un sueldo bruto modesto (2.500 €/mes, ~30.000 €/año + fijos ≈ 34.000 €/año)**:
  p. ej. **3 federaciones/series (9.000 €) + 6 circuitos (7.740 €) + 25 Clubs (9.750 €) + 40 pases (3.160 €)
  + 120 Pro (4.860 €)** ≈ 34.500 €/año. Es un objetivo de **año 2–3** y depende del canal circuitos/federaciones:
  con solo equipos Pro harían falta ~850 equipos de pago, que es mucho para un nicho en España.

Lectura: **el negocio lo sostienen los contratos B2B (Club, Circuito, Federación)**; los equipos Pro son
captación, retención y un complemento.

---

## 5. Fiscal y legal en España/UE (alto nivel, revisar con gestoría)

### IVA

- **Ventas en España**: 21 % sobre todo (B2B y B2C). Precios B2C siempre con IVA incluido.
- **B2B a empresas de otro país de la UE**: inversión del sujeto pasivo, sin IVA español, si el cliente tiene NIF-IVA
  válido en **VIES** y tú estás dado de alta en el **ROI** (modelo 036). Declarar en el modelo 349.
- **B2C a consumidores de otros países UE** (servicios electrónicos): hasta **10.000 €/año** de ventas B2C
  transfronterizas en la UE se puede aplicar IVA español; por encima, IVA **del país del cliente** mediante la
  **ventanilla única OSS** (modelo 369, trimestral).
- **Canarias, Ceuta y Melilla**: no aplica el IVA peninsular a consumidores de allí (IGIC/IPSI, reglas propias).
- **Fuera de la UE** (p. ej. Reino Unido): el B2C de servicios digitales puede obligar a registrarse allí.
- **Atajo recomendado al principio: Merchant of Record (Paddle, 5 % + 0,50 $)**. Paddle vende al cliente final,
  cobra y liquida el IVA de cada país y emite la factura al cliente; tú facturas **solo a Paddle** (una factura por
  liquidación). Cuesta ~3,5 puntos más que Stripe, pero quita OSS, VIES, facturas a cientos de pilotos y
  reembolsos. Pasar a Stripe (+ Stripe Tax 0,5 % por transacción) cuando la facturación lo justifique o cuando
  lleguen las inscripciones (Paddle no sirve para cobrar en nombre de terceros).

### Autónomo vs. SL

| | Autónomo | SL |
|---|---|---|
| Coste de arranque | Alta gratuita; tarifa plana 2026 **88,64 €/mes** 12 meses (prorrogable si ingresos < SMI) | Constitución ~300–600 € (capital mínimo legal 1 € desde la Ley Crea y Crece), gestoría más cara |
| Fiscalidad | IRPF progresivo sobre el beneficio | IS 23–25 % (15 % los dos primeros años con beneficio para entidades de nueva creación) |
| Responsabilidad | **Ilimitada con tu patrimonio** | Limitada a la sociedad |
| Verifactu | Obligatorio desde **1/7/2027** | Obligatorio desde **1/1/2027** |

Recomendación: **autónomo durante la beta y el primer año** (coste bajo, la caja es pequeña) y **SL** cuando el
beneficio supere ~40.000–50.000 €/año, entren contratos con federaciones/circuitos (que prefieren contratar con
sociedad) o se cobren inscripciones de terceros. Ojo a la **responsabilidad**: la app muestra banderas en
pista; un fallo (bandera roja que no llega) en un accidente es un riesgo real. Medidas desde el día 1:

- Condiciones de uso: Box Box **es una ayuda**, **no sustituye** a comisarios, señalización oficial ni
  cronometraje homologado; el organizador es responsable de la seguridad del evento.
- **Seguro de responsabilidad civil profesional** (tecnológica) antes de cobrar el primer evento.
- Si la exposición crece, este riesgo por sí solo es motivo para pasar a SL.

### Facturación: Verifactu y factura electrónica B2B

- **Verifactu** (RD 1007/2023, aplazado por el RDL 15/2025): sistemas de facturación adaptados desde el
  **1/1/2027** (sociedades) y el **1/7/2027** (autónomos y resto). Usar un **software de facturación ya
  certificado** (no programar uno propio) y, si el billing va por Stripe, integrarlo con ese software; con Paddle
  solo hay que emitir las facturas a Paddle.
- **Factura electrónica B2B obligatoria (Ley 18/2022 «Crea y Crece», desarrollada por el RD 238/2026)**: según el
  calendario publicado, obligatoria desde **octubre 2027** para empresas de más de 8 M€ de facturación y
  **octubre 2028** para el resto (incluidos autónomos), a falta de la orden ministerial definitiva. Para Box Box
  importa en 2028; el software de facturación debe soportarla.
- No exentos de factura: el pago por tarjeta no exime de emitir factura (o factura simplificada a consumidores).

### Pasarelas de pago (comisiones públicas)

| Pasarela | Tarifa | Cuándo |
|---|---|---|
| Stripe (España) | Tarjetas EEE estándar **1,5 % + 0,25 €**, premium **2,8 % + 0,25 €**, UK **2,5 % + 0,25 €**, internacionales **3,15 % + 0,25 €** (+2 % si hay cambio de divisa). Billing **0,7 %** del volumen; Tax Basic **0,5 %**/transacción; Invoicing 0,4 % (máx. 2 €) | Cuando haya volumen y gestoría montada |
| Stripe Connect | Mismas tarifas de tarjeta + coste de Connect; la plataforma cobra su comisión aparte | Fase de inscripciones (Stripe es la entidad de pago regulada: evita necesitar licencia de entidad de pago por PSD2) |
| Paddle (MoR) | **5 % + 0,50 $**, IVA y facturas incluidos | Beta y año 1 |
| Google Play | Solo si se publica en la Play Store y se vende dentro de la app | Hoy la APK se distribuye por GitHub: **cobrar en la web** evita la comisión de la tienda |

### Otros

- **RGPD**: la app trata **ubicación** de pilotos (dato sensible en la práctica). Box Box es **encargado del
  tratamiento** del organizador en los datos del evento: contrato de encargo (DPA) en las condiciones, política de
  retención (coincide con el histórico de cada plan), registro de actividades y borrado de cuenta (ya existe).
- **Consumidores**: derecho de desistimiento de 14 días en servicios digitales B2C, salvo consentimiento expreso
  para empezar ya y renuncia; ponerlo en el checkout del Pro/Pase/Fundador.
- **Lifetime**: definir por escrito «de por vida del producto», uso razonable y qué pasa si se cierra el
  servicio (exportar datos), para evitar reclamaciones.

---

## 6. Plan de lanzamiento de precios

| Fase | Fechas | Qué se cobra | Objetivos y acciones |
|---|---|---|---|
| **0. Beta cerrada gratuita** | oct–dic 2026 | Nada | 3–5 **organizadores socios** (design partners) y sus equipos. A cambio: feedback, testimonio, logo, datos de uso. Medir: horas-equipo por evento, equipos por evento, cuántos dispositivos de box, incidencias de conexión, coches máximos por instancia. Pasar Render a plan de pago (sin dormirse) **antes del primer evento real**. Darse de alta (autónomo + ROI) y abrir Paddle |
| **1. Preventa / early-bird** | ene–feb 2027 (pretemporada) | **Fundador equipo 149 €** (100 plazas); **Club anual Fundador 195 €/año** (50 % del precio, **precio bloqueado mientras siga suscrito**, 15 plazas); bonos de 5 pases con 20 % extra (6 por el precio de 4) | Publicar la página de precios con los precios **completos** tachados (ancla). Los socios de la beta pasan a Fundador gratis el primer año. Caja para la temporada sin vender lifetime a organizadores |
| **2. Temporada 2027 a precio de lista** | mar–sep 2027 | Todos los planes del §3 | Objetivo: 10 organizadores de pago, 1–2 circuitos, 100 equipos Pro. Cada evento de un organizador = campaña al Pro para sus equipos (prueba Pro gratis 14 días tras el evento) |
| **3. Inscripciones + revisión de precios** | sep–dic 2027 | Comisión por inscripción (Stripe Connect); evaluar migrar el billing de Paddle a Stripe | Revisar con datos: si > 70 % de los organizadores compra sin regatear, **subir 20–30 % para clientes nuevos** en la pretemporada 2028; los existentes mantienen precio (grandfathering) un año como mínimo. Verifactu operativo antes del 1/7/2027 (autónomo) |
| **4. Canal institucional** | 2028 | Circuito y Federación/White-label | Con casos de éxito de 2027, propuestas a federaciones autonómicas y series monomarca. Factura electrónica B2B preparada para oct 2028 |

Reglas para subir precios sin dolor:

- Subir en **pretemporada** (enero–febrero), nunca en mitad de temporada.
- **Avisar con 60 días** y mantener precio a los clientes actuales (al menos 12 meses).
- Subir añadiendo valor visible (stints y combustible, vista TV, marca propia), no solo el número.
- Señales para subir: conversión alta del pase, nadie se queja del precio, peticiones de «más equipos» en el Pase M.

---

## Fuentes

- MYLAPS Speedhive (1.099 $/año), Orbits incluido y paquetes de transpondedores: https://www.acu.org.uk/news/2022/01/mylaps-2022-offers-for-acu-clubs/ · https://www.acu.org.uk/Uploaded/1/Documents/Members%20Benefits%202021/MYLAPSACUFlyer2021DIGITAL.pdf · https://www.aidka.com.au/transponders/
- MYLAPS TR2 suscripción 129,99 $/año: https://harrisraceradios.com/products/mylaps-tr2-speedway-transponder · https://www.aidka.com.au/?p=5145
- Apex Timing (sin precios públicos, «sin coste por socio ni comisión»): https://www.apex-timing.com/en/live-timing/ · https://apex-timing.com/en/gokart-live-timing-c26.html
- Race Monitor (0,99 $/mes, 4,99 $/año): https://apps.apple.com/app/id404470174
- RaceHero (NASA, USPKS): https://mazdaracers.com/topic/5977-nasa-selects-racehero-as-exclusive-live-timing-results-service/ · https://www.uspks.com/uspks-partners-with-racehero-to-provide-live-timing-broadcast/
- AutosportLabs / Podium: https://autosportlabs.com/product/podiumconnect-micro-live-motorsports-telemetry-stream-data-from-your-racecar-with-aim-motec-ecumaster-vbox-lowrance · https://www.autosportlabs.com/shop/
- RaceChrono Pro: https://apps.apple.com/app/id1129429340 · https://apppricinglab.com/app/google_play/com.racechrono.pro
- Harry's LapTimer (ediciones y pase Togo): https://gps-laptimer.de/products
- TrackAddict Pro: https://alternativeto.net/software/trackaddict
- MotorsportReg (0 € al organizador, 2 $ por inscripción): https://support.motorsportreg.com/booking-fee-faq · https://blog.motorsportreg.com/motorsportreg-pays-you-to-use-it
- RunSignup (6 % + 1 $ por carrito): https://info.runsignup.com/?p=32583
- Eventbrite España (6 % / 9 % + 0,19 €): https://www.eventbrite.com/help/en-us/articles/755615/ · https://checkoutpage.com/tools/eventbrite-fee-calculator
- Stripe España (tarifas, Billing, Tax, Invoicing): https://stripe.com/es/pricing
- Paddle / Lemon Squeezy (5 % + 0,50 $): https://dodopayments.com/blogs/paddle-vs-lemon-squeezy/ · https://dodopayments.com/blogs/cheapest-merchant-of-record
- Render (planes, 0,15 $/GB, instancias 7/25/85 $): https://render.com/pricing.md
- Neon (0,106 $/CU-h Launch, 0,35 $/GB-mes): https://neon.com/pricing
- Lifetime deals (pros/contras, coste de servidor): https://dodopayments.com/blogs/lifetime-deals-saas-pros-cons · https://indiehackers.com/post/the-45k-sugar-rush-what-110k-in-appsumo-gross-revenue-taught-us-0383952b35
- Verifactu aplazado a 2027 (RDL 15/2025): https://www.legaltoday.com/actualidad-juridica/noticias-de-derecho/nueva-prorroga-verifactu-no-sera-obligatorio-hasta-2027-para-sociedades-y-otros-contribuyentes-2025-12-04/ · https://www.infoautonomos.com/blog/verifactu-cuando-es-obligatorio-a-quien-afecta/
- Factura electrónica B2B (Ley Crea y Crece, RD 238/2026, calendario): https://edicomgroup.com/es/blog/la-facturacion-electronica-sera-obligatoria-para-las-empresas-espanolas · https://declarando.es/factura-electronica/factura-electronica-obligatoria
- Tarifa plana de autónomos 2026 (88,64 €): https://getquipu.com/blog/cuota-de-autonomos-primer-ano/ · https://declarando.es/blog/bonificaciones-autonomos
- Formato de equipos en resistencia de karting (Resiscat 2026): https://club.criccrac.com/wp-content/uploads/2025/12/Reglamento_Deportivo_Resiscat_2026_ESP.pdf

Puntos sin fuente que hay que validar con 5–10 organizadores en la beta: precio típico de inscripción por
equipo en resistencias amateur en España, nº de eventos/año por organizador y disposición a pagar por evento.
Las tasas de churn/renovación y los CAC son estimaciones propias.

---

# Parte 3 · Cómo venderlo (go-to-market)


> Fecha: 2026-10-05. Base: `docs/CONTEXTO.md` (estado a 03/10: web PWA + APK Android v13 por GitHub, Render free, Neon free, 18 tests en verde, banderas y eventos multi-equipo recién hechos y **aún sin probar en pantalla ni en coche**).
> Supuesto: fundador solo, en España, con poco dinero y tiempo de tardes/fines de semana. Todo lo que sigue está dimensionado para eso.
> Las fuentes van con URL. Lo marcado **[verificar]** no lo he podido confirmar en la web y hay que llamar o mirar redes antes de actuar.

### Resumen en 6 líneas

1. **Cabeza de playa: resistencia de karting por equipos** (alquiler/4T, 2 h–24 h). Ahí el coche no tiene OBD, pero no hace falta: el producto ya funciona «Sin OBD» (GPS + móvil), y el dolor de comunicar box↔piloto y organizar banderas/avisos es real y se repite cada fin de semana.
2. **Quien paga es el organizador** (circuito o promotor de la serie). Cada evento mete a 15–30 equipos en la app sin coste de adquisición: ese es el motor de crecimiento.
3. **Segundo segmento: organizadores de track days** (8000vueltas, Tandas Privadas, CM3…). Ahí sí aparece OBD y telemetría como «recuerdo» para cada participante.
4. **No competir con el cronometraje oficial** (Apex Timing, transpondedores): Box Box es la capa de equipo y de dirección de carrera *encima* del cronometraje, no su sustituto.
5. **Antes de vender, tres arreglos de credibilidad**: servidor de pago (Render free se duerme), APK en Google Play y un evento real probado de punta a punta.
6. **Objetivo a 12 meses realista**: 6–10 organizadores recurrentes, 300–500 equipos que han corrido con la app, 40–80 equipos de pago, ~1.000–2.000 €/mes de ingresos. Es un negocio de nicho que se gana evento a evento.

---

## 1. Cliente ideal (ICP) y buyer personas

### 1.1 Mapa del mercado en España (dónde está la gente)

| Segmento | Ejemplos reales | Tamaño / frecuencia | ¿Encaja Box Box? |
|---|---|---|---|
| **Resistencia de karting por equipos (alquiler / 4T)** | Open Karting de Resistencia en Circuit d'Osona (24 h en julio, 6 h, 3 h, 2 h; equipos de 2–8 pilotos) y BPR Championship en Karting Cabanillas y Ángel Burgueño, organizados por Soul Racing Kart ([soulracingkart.com](https://soulracingkart.com/campeonatosderesistencia/)); Campeonato de Resistencia Karting Club Los Santos, 4 h, ~25 equipos, y sus «24 Horas SWS de Resistencia por equipos» ([kartingclublossantos.com](https://www.kartingclublossantos.com/eventos/61-24-horas-sws-de-resistencia-por-equipos/)); 24 Horas Kartpetanas en Kartpetania (Segovia), ~20 equipos 4T nacionales y europeos ([autofacil.es](https://www.autofacil.es/limits-karting-team-correra-24-horas-karpetanas/), [Facebook 24h Kartpetanas](https://www.facebook.com/24hKartpetanas/)); 2H de resistencia por parejas en Karting Vendrell ([kartingvendrell.com](https://kartingvendrell.com/tienda/racedays/)); 6 Hores de Resistència Trofeu Mercat del Ram ([naciodigital.cat](https://naciodigital.cat/osona/esports/equip-open-guanya-amb-autoritat-les-6-hores-de-resistencia-de-karting-trofeu-mercat-del-ram.html)); resistencias de 2–3 h abiertas y privadas para empresas en el Karting de Asturias, desde 75 €/equipo/hora ([vivirasturias.com](https://www.vivirasturias.com/karting/i/54828303/circuito-de-karting-de-asturias)); Universal Games ([universalgames.es](https://universalgames.es/carreras-de-resistencia/)) | Decenas de circuitos y varios promotores; cada evento tiene entre 10 y 30 equipos de 2 a 8 pilotos. Hay carreras todos los meses | **Sí, el mejor**. Sin OBD, mucho dolor de box, organizador concentrado |
| **Ranking de karting de alquiler SWS (Sodikart)** | Más de 140.000 pilotos y más de 730 circuitos asociados en 70 países; la final internacional de 2025 se corrió en el KartCenter Campillos ([sodiwseries.com](https://www.sodiwseries.com/en-gb/news/sodi-world-series-a-record-breaking-2025-season-and-stronger-ambitions-for-2026-183.html), [sodikart.com](https://www.sodikart.com/es-es/news/press-release/sws-une-saison-record-et-des-ambitions-venir-189.html)) | Circuitos españoles SWS = red ya organizada | Sí, vía circuitos SWS que hacen resistencias |
| **Track days / tandas en coche propio** | 8000vueltas (máx. 20 coches, 325 € por 2 h y 455 € por 4 h; Jarama, Navarra, Portimão, Spa, Nürburgring) ([autofacil.es](https://www.autofacil.es/track-days-calendario-8000v/)); Tandas Privadas (89–299 €), Manuvi Pilot School, Motor Extremo, Porsche Club España en el Jarama; CM3 a 145 € ([soymotero.net](https://soymotero.net/noticia/rueda-con-cm3-en-el-circuito-del-jarama-10363/)); Trackrat Club en Montmeló, Calafat y MotorLand ([trackrat](https://trackrat.wpprovider.nl/circuits/)); Gedlich Racing «Endless Summer» en Navarra, MotorLand y Valencia ([gedlich-racing.com](https://gedlich-racing.com/en/?p=7602)) | Decenas de organizadores. Formato típico: 6 tandas de 20 min por grupo ([highmotor.com](https://www.highmotor.com/que-es-un-track-day.html)) | **Sí, el segundo**. OBD + GPS + vídeo; banderas útiles para el organizador |
| **Resistencia en coche amateur / semiprofesional** | Campeonato de España de Resistencia (CER), sobre todo de pilotos amateurs ([motorpasion.com](https://www.motorpasion.com/formula1/el-cer-visito-el-jarama)), TCR Spain ([touringcartimes.com](https://www.touringcartimes.com/2025/11/05/tcr-spain-reveals-2026-schedule/)) | Pocos equipos, ya llevan AiM/MoTeC y radio | Más tarde. Venta difícil, regulación |
| **Rallys de regularidad (clásicos)** | Cantabria Classic Rally ([motor16.com](https://www.motor16.com/las-ultimas-noticias/cantabria-classic-rally/)), Rali do Lacón Históricos ([festivalesdeespana.com](https://www.festivalesdeespana.com/festival/xvi-rali-do-lacon-historicos-o-carballino)), Rally de España Histórico en Ávila ([avilared.com](https://avilared.com/art/8710/avila-se-convierte-en-sede-permanente-del-rally-de-espana-historico)) | Mucho volumen, pero Blunik es el estándar ([km77.com](https://www.km77.com/revista/teletransporte/eco-rallye-comunitat-valenciana-2017/)) | **No por ahora**. Necesita tablas de medias, tramos de enlace y roadbook: otro producto |
| **Karting federado (CEK, etc.)** | Campeonato de España de Karting en MotorLand, 16–17/05/2026 ([festivalesdeespana.com](https://www.festivalesdeespana.com/festival/campeonato-espana-karting-motorland-alcaniz)) | La normativa CIK/RFEDA limita la electrónica a bordo **[verificar el reglamento técnico vigente]** | No. Los chasis llevan MyChron/Alfano |

**Conclusión del mapa:** el ICP de lanzamiento es la **resistencia de karting por equipos**. Es frecuente, social (equipos de amigos o de empresa que vuelven), barato de entrar, la tecnología del equipo es casi nula (la pizarra de box) y hay pocos promotores que mueven a muchos equipos. Los track days van después, con el mismo producto y otro mensaje.

### 1.2 ICP (empresa que paga)

> **Promotor o circuito de karting en España que organiza al menos 6 resistencias por equipos al año, con 12–30 equipos por carrera, que ya publica resultados en redes y quiere diferenciarse de otros circuitos o subir el precio de inscripción.**

Señales para cualificar: tiene página de «resistencia» o «campeonato» en su web, publica la clasificación en PDF o en Instagram, usa Apex Timing u otro cronometraje con live timing ([apex-timing.com](https://www.apex-timing.com/en/live-timing/)), tiene un grupo de WhatsApp con los capitanes y hace la reunión de pilotos (*briefing*) a viva voz.

Descartes: circuitos que solo venden tandas sueltas de 10 min a turistas (cero dolor de equipo), y campeonatos federados que exigen homologación.

### 1.3 Buyer personas

#### A. Organizador / promotor («Jordi, 42, organiza la liga de resistencia del circuito»)

| | |
|---|---|
| Quién es | Gerente o responsable de eventos del circuito, o promotor independiente que alquila el circuito (tipo Soul Racing Kart). Lo hace casi todo él: inscripciones, sorteo de karts, *briefing*, dirección de carrera, resultados y fotos |
| Dolores | 1) La dirección de carrera va por banderas físicas y comisarios: un aviso («pit lane cerrado», «drive-through al 14») llega tarde o no llega. 2) Los equipos le preguntan sin parar «¿cuánto llevamos?, ¿cuántos relevos?». 3) Su evento se parece al de cualquier otro circuito y compite por precio. 4) Tiene poco contenido para redes y los patrocinadores no ven nada |
| Qué gana con Box Box | Panel de dirección de carrera con bandera y aviso de texto **que llega a la pantalla y a la voz de todos los pilotos y boxes**, con confirmación de quién lo ha visto. Mapa con todos los coches en directo para proyectar en la carpa. Clasificación en vivo compartible. Un «extra premium» que justifica +5–10 € por equipo |
| Objeciones | «Ya tengo Apex» → no lo sustituye, lo complementa. «Los pilotos no llevan móvil en el kart» → soporte de 15 € y uno por kart, o solo el del box (ver §3.7). «¿Y si se cae el servidor?» → plan B: la carrera sigue con banderas físicas, Box Box nunca es la única fuente de verdad |
| Mensaje | **«Tu dirección de carrera en el bolsillo de cada piloto. Banderas y avisos que se oyen dentro del casco, y sabes quién los ha visto.»** |

#### B. Jefe de equipo / capitán («Raúl, 35, capitán de un equipo de amigos que corre 6–8 resistencias al año»)

| | |
|---|---|
| Quién es | Monta el equipo, paga la inscripción, organiza los relevos en una hoja de cálculo y hace de box con una pizarra |
| Dolores | No sabe en tiempo real el ritmo de su piloto ni cómo va frente a los rivales. Los relevos se calculan con el móvil y un cronómetro. Comunicar «entra en la próxima» depende de que el piloto mire la pizarra. Tras la carrera no hay datos para saber quién fue más constante |
| Qué gana | Vueltas y parciales en vivo, constancia y vuelta ideal por piloto, mensajes con voz y respuesta OK/NO/PROBLEMA, botón «Viene a boxes / En boxes», historial de todas las carreras del equipo |
| Mensaje | **«Deja la pizarra. Habla con tu piloto en pista y sabe cuánto rinde cada uno en cada relevo.»** |

#### C. Piloto («Marta, 28, corre con su equipo y hace simracing»)

| | |
|---|---|
| Dolores | Quiere saber sus tiempos frente a sus compañeros y presumirlo. No se entera de las banderas amarillas en una curva ciega. Quiere vídeo con datos para redes |
| Qué gana | Sus estadísticas en el perfil, vueltas comparables, aviso de bandera con voz, y (pronto) un vídeo con telemetría superpuesta para Instagram |
| Mensaje | **«Tus vueltas, tus parciales y tus piques con el equipo, guardados en tu perfil. Gratis.»** |
| Papel en la venta | No paga, pero **es el canal**: lo comparte, se lo pide al capitán y al organizador |

#### D. Circuito (gerente de instalación: karting o autódromo)

| | |
|---|---|
| Dolores | Llenar fechas de entre semana y de invierno, fidelizar grupos de empresa, diferenciarse del circuito de al lado, vender más que la tanda |
| Qué gana | Producto «resistencia conectada» para empresas y grupos (teambuilding con clasificación y mapa en la pantalla del bar), marca propia en el evento, datos de qué grupos repiten |
| Mensaje | **«Convierte una tanda de grupo en una carrera de verdad, con box, banderas y clasificación en la pantalla. Sin instalar nada.»** |

#### E. Organizador de track days («Íñigo, 45, 8–15 jornadas al año en Jarama, Navarra y Motorland»)

| | |
|---|---|
| Dolores | Seguridad (avisar de un coche parado o aceite en pista a todos a la vez), grupos por nivel, dar valor por los 300 € que cobra, captar repetidores |
| Qué gana | Bandera roja / amarilla / aviso de texto a todos los coches con voz; mapa de la pista con todos los coches; y para cada cliente, al acabar, sus vueltas con telemetría OBD (rpm, temperatura) y GPS, un «informe del día» con marca del organizador |
| Mensaje | **«Cada participante se lleva sus datos y tú le das un motivo para volver. Y si hay aceite en la curva 3, lo saben todos en un segundo.»** |

---

## 2. Posicionamiento, propuesta de valor y marca

### 2.1 Posicionamiento

**Categoría:** «la radio y el muro de boxes para carreras amateur», no «otra app de cronometraje».

| Alternativa | Qué hace bien | Por qué Box Box gana o no |
|---|---|---|
| Pizarra + WhatsApp + hoja de cálculo | Gratis, todo el mundo la entiende | Box Box: en vivo, con voz y con historial. **El enemigo real es este** |
| Apex Timing / RaceFacer / BMI / Clubspeed (cronometraje del circuito) ([bmileisure.com](https://bmileisure.com/kart-timing-systems/)) | Cronometraje oficial con transpondedor, live timing, gestión del circuito | No comunican con el piloto ni dan dirección de carrera por equipo. **Complemento**: «Apex cronometra, Box Box comunica» |
| RaceChrono (19,99 €), Harry's LapTimer (8,99–27,99 €), TrackAddict (gratis + pago) ([motor1.com](https://es.motor1.com/news/463217/mejores-apps-telemetria-telefono-movil/)) | Telemetría individual, OBD y vídeo, más de 2.000 circuitos | Son de **un solo piloto**: no hay box, ni equipo, ni organizador, ni eventos. Box Box es multijugador |
| Race Cockpit (iOS, PitLane Connect, pago por horas, exige RaceBox Mini) ([App Store](https://apps.apple.com/app/id6757126834)) | Lo más parecido: telemetría para resistencia de karting con conexión al pit | Solo iOS, hardware obligatorio y sin capa de organizador. **Es la prueba de que el dolor existe**. Vigilarlo |
| AiM / MyChron / Alfano | Profesional | 300–1.500 € por coche y sin comunicación. Otro público |

**Frase de posicionamiento (interna):**
Para equipos y organizadores de carreras amateur de resistencia que hoy se comunican con pizarras y gritos, Box Box es la radio y el muro de boxes en el móvil que conecta piloto, box y dirección de carrera en tiempo real, sin hardware caro. A diferencia de las apps de cronometraje para un piloto, Box Box está pensada para el equipo y para el evento entero.

### 2.2 Propuesta de valor por capa

| Capa | Promesa | Prueba que hay que enseñar en 10 s |
|---|---|---|
| Organizador | Dirección de carrera digital + mapa + clasificación | Vídeo: pulsa «Amarilla» y 3 móviles se ponen amarillos y hablan |
| Equipo | Box en el portátil, mensajes con voz, relevos y ritmo | Pantalla Box con vueltas en vivo y «ENTRA YA EN BOX» |
| Piloto | Tus datos y tu historial gratis | Perfil con mejor vuelta, constancia y vuelta ideal |

### 2.3 Opinión sobre el nombre «Box Box»

**A favor:** cualquier aficionado lo reconoce al instante (es la orden de la radio de F1 para entrar a boxes), es corto, internacional y dice exactamente «comunicación con el box». Funciona como marca de producto y como grito de guerra en contenido («Box box, box box»). Mucho mejor que «Cencerro Racing».

**En contra (riesgos reales):**
1. **Búsqueda imposible**: «box box» devuelve cajas, la frase de F1, podcasts y tiendas. El SEO de marca cuesta. Los dominios y nombres cortos ya están cogidos (el propio `CONTEXTO.md` dice que `box-box` y `boxbox` estaban ocupados en Render).
2. **Marca registrada**: «Box Box» es frase genérica de F1, y es probable que existan marcas en la clase 9 (software) o la 41 (eventos). **Antes de gastar en logo y dominio, buscar en la OEPM y en EUIPO TMview** (gratis). Registrar la marca en España cuesta unos 125–150 € por clase **[verificar la tasa actual]**.
3. Hay podcasts y canales de F1 con nombres parecidos: confusión en YouTube.

**Recomendación:** quedarse con **Box Box** como nombre hablado, pero usar siempre una forma registrable y buscable: **«BoxBox Racing»** o **«Box Box · Race Comms»**, con un dominio propio del tipo `boxbox.racing`, `boxboxapp.com` o `getboxbox.com` **[comprobar disponibilidad]**. En Play Store: «Box Box: radio y telemetría de equipo». Quitar del todo «Cencerro» en lo que ve el usuario (el certificado de firma CN=Cencerro Racing y el paquete `com.cencerro.racing` no se ven: se pueden dejar).

### 2.4 Pitch

**Una frase:**
> **Box Box convierte el móvil de cada piloto en la radio y la telemetría del equipo, y da al organizador banderas y clasificación en directo para toda la carrera.**

**30 segundos (organizador):**
> En una resistencia de karting el box se comunica con una pizarra y la dirección de carrera con banderas que medio pelotón no ve. Box Box lo cambia con algo que todos llevan encima: el móvil. Cada equipo ve en su portátil las vueltas y parciales de su piloto en directo y le manda mensajes que oye en el casco. Tú, como organizador, ves todos los coches en el mapa y la clasificación en vivo, y cuando sacas una amarilla o un aviso les llega a todos al instante y sabes quién lo ha visto. No hay que instalar nada en el circuito ni cambiar tu cronometraje. Te propongo probarlo gratis en tu próxima carrera.

**30 segundos (capitán de equipo):**
> ¿Sigues haciendo los relevos con una pizarra y un cronómetro? Con Box Box el móvil del kart manda GPS y tiempos al portátil del box. Ves el ritmo de cada relevo, le dices «entra en la próxima» y lo oye, y él te contesta OK con un botón. Al acabar tienes la constancia y la vuelta ideal de cada piloto. Gratis para empezar.

---

## 3. Canales y tácticas

### 3.0 Requisitos previos (sin esto, no vender)

| Arreglo | Por qué | Coste | Dificultad |
|---|---|---|---|
| Pasar Render a instancia de pago (Starter) | La instancia gratuita se duerme tras un rato sin tráfico y tarda en despertar: en una salida de carrera es inaceptable **[comprobar el comportamiento actual del plan free]** | ~7 $/mes | Baja |
| Publicar la APK en Google Play (prueba cerrada → producción) | Instalar una APK de GitHub con «orígenes desconocidos» genera desconfianza y fricción; sin Play no hay ASO | 25 $ una vez. Las cuentas personales nuevas necesitan una prueba cerrada con testers antes de producción **[verificar requisito actual: 12 testers durante 14 días]** | Media |
| Dominio propio + correo profesional | Credibilidad en el primer email | ~15 €/año + correo 0–6 €/mes | Baja |
| Política de privacidad y aviso legal (RGPD) | Se tratan ubicación y datos de pilotos, y Play la exige | 0 € (plantilla revisada) | Baja |
| Un **modo evento a prueba de fallos**: probar 15–20 móviles a la vez, con mala cobertura y pantalla apagada | El primer evento real es el caso de éxito o el entierro | Tiempo | Media |
| Kit físico de 6–10 soportes de móvil para volante de kart + bolsitas / bridas | Los karts de alquiler no tienen dónde poner el móvil | 60–120 € | Baja |

Recordatorio: **no hay versión iOS**. En España Android es mayoritario, y el box puede ir en el navegador de un portátil o de un iPhone (la PWA), pero el móvil del coche tiene que ser Android. Decirlo claro en la venta y llevar 4–6 Android baratos de préstamo para el evento piloto (segunda mano, 40–60 € cada uno).

### 3.1 Venta directa a organizadores (canal nº 1)

**Lista inicial (30–50 cuentas)**, con nombre, teléfono, Instagram, nº de eventos al año y si tienen Apex:
- Promotores: Soul Racing Kart (Osona, Cabanillas, Ángel Burgueño), Karting Club Los Santos, Kartpetania (24 h), Karting Vendrell, Karting de Asturias, Universal Games, KartCenter Campillos (sede SWS), Ozone Karting Los Barrios (primer circuito 100 % eléctrico de España según SWS) ([sodiwseries.com](https://www.sodiwseries.com/en-gb/news/sodi-world-series-a-record-breaking-2025-season-and-stronger-ambitions-for-2026-183.html)).
- Cómo ampliarla: buscar en Google e Instagram «resistencia karting» + provincia, «24 horas karting», «campeonato resistencia 4T», y la lista de circuitos SWS de España en la web de Sodi; mirar quién publica clasificaciones.
- Track days: 8000vueltas, Tandas Privadas, CM3, Manuvi, Motor Extremo, Trackrat, Gedlich Racing, clubes de marca (Porsche Club España).

**Prioridad**: 1) promotores que alquilan el circuito y viven de diferenciar su serie; 2) circuitos con liga propia; 3) organizadores de track days.

#### Guion de primer contacto · WhatsApp (corto, el canal que más contesta en el motor)

> Hola Jordi, soy Francisco. Corro resistencias y he hecho una app para que el box y el piloto se comuniquen en carrera con el móvil (mensajes con voz dentro del casco, tiempos en vivo) y para que el organizador mande banderas y avisos a todos los equipos a la vez y vea quién los ha leído.
> Te dejo un vídeo de 40 s: [enlace]
> Me gustaría probarla **gratis** en una de vuestras resistencias: yo me encargo de todo (llevo soportes y móviles de préstamo). ¿Te viene bien hablarlo 10 minutos esta semana?

#### Guion por email (para circuitos más formales)

> **Asunto:** Banderas y avisos en el móvil de cada piloto en vuestra próxima resistencia (prueba gratis)
>
> Hola [nombre]:
>
> He visto que el [fecha] organizáis la [nombre de la carrera] con [N] equipos. Te escribo porque he desarrollado Box Box, una app que añade a la carrera lo que el cronometraje no hace:
>
> - **Dirección de carrera digital**: verde, amarilla, safety car, roja o un aviso de texto que llegan a la pantalla y a la voz de todos los pilotos y boxes, con confirmación de quién lo ha visto.
> - **Mapa en directo** con todos los karts y **clasificación en vivo** para proyectar en la carpa o compartir en redes.
> - Para cada equipo, **comunicación box↔piloto** con voz y tiempos y parciales en vivo.
>
> No sustituye a vuestro cronometraje ni hay que instalar nada. Os propongo usarlo **gratis** en una carrera: yo voy ese día, doy de alta a los equipos y llevo el material. A cambio os pido permiso para grabar y publicar un caso con vuestro nombre.
>
> Vídeo de 40 s: [enlace] · Web: [enlace]
>
> ¿Lo hablamos 10 minutos por teléfono? Me adapto a tu horario.
>
> Francisco Cortés · [teléfono]

**Seguimiento**: a los 3 días, un mensaje con un dato o un clip («así se ve una amarilla en 3 móviles a la vez: [vídeo 10 s]»). A los 7 días, el último («¿Lo dejamos para la carrera de [mes]?»). Después, a la lista de «más adelante».

**Mejor aún que escribir: ir.** Presentarse en una resistencia como equipo participante (la propia inscripción es la táctica de venta: 75–300 € por equipo), usar Box Box en el box de uno mismo y enseñárselo al organizador y a los boxes de al lado en directo. En este nicho, la confianza va cara a cara.

#### Guion de demo (15–20 min, en el circuito o por videollamada)

| Min | Qué | Cómo |
|---|---|---|
| 0–3 | Preguntar, no enseñar | «¿Cómo comunicáis hoy las banderas? ¿Qué os preguntan más los equipos? ¿Qué pasó la última vez que algo salió mal?». Apuntar sus palabras |
| 3–8 | El momento «guau» | Con 2–3 móviles en la mesa (simulador activo): el organizador pulsa **Amarilla** → los móviles se ponen amarillos y hablan → en su panel aparece quién la ha visto. Luego un aviso de texto («Drive-through dorsal 14») |
| 8–12 | El valor para sus equipos | Pantalla Box: vueltas en vivo, mensaje con voz al piloto y respuesta OK. Mapa con varios coches |
| 12–15 | Cómo sería su carrera | «Yo llego 1 h antes, doy de alta a los equipos con el código del evento, pongo soportes. Si algo falla, la carrera sigue con banderas como siempre» |
| 15–20 | Cierre | Fecha concreta para la prueba gratis + qué recibe a cambio (vídeo y resultados con su marca) + qué pido (testimonio, publicación, presentarme a los equipos en el *briefing*) |

**Regla**: nunca cerrar la demo sin una fecha en el calendario.

### 3.2 Piloto gratuito en un evento real = caso de éxito

Elegir **una** carrera de 3–6 h con 12–20 equipos, cerca, en noviembre o diciembre de 2026.

**Antes (2 semanas)**
- Pista del evento grabada en la app (trazado, meta, tramos) a partir de una vuelta GPS real o dibujada.
- Mensaje a los capitanes (vía el organizador): «Esta carrera estrena Box Box. Instala la app y únete con el código XXXX». Vídeo de 60 s de cómo se hace.
- Prueba en el circuito un día de tandas: cobertura móvil, calidad del GPS, vibración del soporte, batería en 1 h.

**Durante**
- Llegar 90 min antes. Mesa «Box Box» junto a la de inscripción con 4–6 Android de préstamo cargados y soportes.
- 2 minutos en el *briefing*: «si veis la pantalla amarilla y oís "amarilla", es la dirección de carrera».
- El organizador usa el panel desde un portátil o tablet; el mapa proyectado en la carpa.
- Grabar TODO: pantallas, caras, el box de un equipo recibiendo un mensaje, la amarilla en varios móviles.

**Después (48 h)**
- Encuesta de 3 preguntas a capitanes (NPS, qué usaste, ¿pagarías?).
- Enviar a cada equipo su resumen (vueltas, constancia, ideal) → **pedir que lo compartan etiquetando al circuito y a Box Box**.
- Caso de éxito publicado: números (equipos, mensajes enviados, banderas vistas en X s de media), 2 citas y vídeo de 60–90 s.

**Métrica de éxito del piloto**: ≥ 70 % de equipos conectados durante ≥ 80 % de la carrera, ≥ 1 bandera vista por ≥ 90 % de los equipos en menos de 10 s, NPS de capitanes ≥ 30 y el organizador repite (de pago o con descuento).

### 3.3 Partnerships

| Socio | Qué ofrecer | Qué pedir | Dificultad |
|---|---|---|---|
| **Circuitos de karting** con resistencias | Gratis los 2 primeros eventos y después precio de socio; marca blanca ligera (logo del circuito en el evento) | Que la app sea «la oficial» de su liga; enlace en su web; presentación en *briefings* | Media |
| **Promotores multi-circuito** (Soul Racing Kart y similares) | Licencia de temporada con descuento | Exclusividad en su serie y presencia en su comunicación | Media |
| **Red SWS / Sodikart** | Integración: «tu resistencia SWS con box conectado» | Contacto con circuitos SWS de España; quizá aparecer en su newsletter | Alta (empresa grande; a medio plazo) |
| **Vendedores de OBD2** (vLinker, OBDLink, Vgate, KUULAA en Amazon y tiendas de recambios) | Lista de adaptadores compatibles probados; reseñas y vídeos | Afiliación (Amazon Afiliados), y más adelante un *bundle* «adaptador + 1 año de Box Box» | Baja (afiliación) / Media (bundle) |
| **Vendedores de soportes y GPS** (RaceBox, soportes de kart) | Compatibilidad con GPS externo como mejora futura | Afiliación, sorteos | Media |
| **Escuelas de conducción** (Manuvi, cursos en circuito) | Telemetría y vueltas por alumno para el instructor | Uso en cursos y testimonios | Media |
| **Organizadores de track days** | Informe del día con su marca para cada cliente | Pago por evento y difusión a sus clientes | Media |

### 3.4 Contenido

El producto es visual: **la bandera que aparece a la vez en 10 móviles y habla** es un clip viral en sí.

| Formato | Ideas concretas | Frecuencia | Coste |
|---|---|---|---|
| **Reels / TikTok / Shorts (15–40 s)** | «Así se manda una amarilla a 20 karts a la vez»; «Mi box me dice ENTRA YA y yo contesto con un botón»; «Antes: pizarra. Ahora: esto»; tiempos de un relevo con la pantalla Box superpuesta; reacciones de pilotos al oír la voz en el casco | 3 por semana | 0 € (móvil + CapCut) |
| **Onboard con telemetría superpuesta** | Exportar vueltas (tiempo, velocidad, rpm, posición en el mapa) y superponerlas al vídeo de una GoPro o del móvil. Hasta tener exportación propia: overlays hechos a mano con RaceRender o Telemetry Overlay **[verificar formato de importación (CSV/GPX)]**. **Mejora de producto muy rentable: exportar CSV/GPX de cada vuelta** | 1 por semana | 0–100 € |
| **YouTube (5–12 min)** | Crónica de una resistencia «con datos»: estrategia de relevos, quién fue más constante; tutorial «cómo montar tu box con un portátil»; «qué OBD2 comprar para tu track day (probados)» (con afiliados) | 2 al mes | 0 € |
| **Resúmenes de evento** | Clasificación + mapa + mejores vueltas, con la marca del organizador, publicados en las 24 h siguientes | Cada evento | 0 € |

**Creadores e influencers** (colaboración en especie: probarlo en su equipo o track day):
- Track days y motor: Axel EspxNur (comunidad de pilotos españoles de Nürburgring), Petrolhead Garage (más de 50.000 suscriptores, mecánica y preparación) ([diariomotor.com](https://www.diariomotor.com/noticia/canales-youtube-motor-espana/)).
- Simracing en español: Stradi, Heikki, Pablo López, PhotoRacer, OriolRace, Alxinako, IMBRubio77; pilotos de GT como Coque López o José Serrano ([autofacil.es](https://www.autofacil.es/simracers-mejores-pilotos-espanoles-esports/)). El simracer es un buen público: entiende la telemetría y muchos corren resistencias de karting reales. Idea: **reto «simracers al karting real» de 3 h con Box Box**, grabado por ellos.
- Micro-influencers de karting (1–20 mil seguidores) de cada circuito: más baratos, más cercanos y convierten mejor. Buscar con #resistenciakarting, #karting4T, #24hkarting.

### 3.5 Comunidad

- **Grupo de WhatsApp o Telegram «Box Box · capitanes»** con quienes ya lo han usado: avisos de versión, feedback y «¿quién corre en X?». Es tu panel de producto y tu canal de referidos.
- **Estar donde ya están**: los grupos de WhatsApp de cada liga (a través del organizador), los grupos de Facebook de los circuitos y de karting por zona, y los foros de marca (clubes Porsche, BMW, MX-5) para track days. Aportar antes de anunciar: publicar los resúmenes con datos de la carrera, no anuncios. No he encontrado grupos públicos grandes y concretos para citar **[buscar a mano en Facebook: «karting resistencia», «track day España», «tandas circuito»]**.
- **Discord**: solo si aparece una comunidad de simracers. No crearlo vacío.
- **Ranking propio entre eventos** (más adelante): «Box Box Endurance Ranking» con constancia y vuelta ideal por piloto, como el SWS, pero para equipos. Crea motivo para volver.

### 3.6 SEO (poco esfuerzo y largo plazo)

Páginas que la gente busca y la competencia no cubre en español:
- «app para comunicar box y piloto», «radio de equipo karting», «cómo organizar una resistencia de karting» (guía + plantilla de reglamento + **calculadora de relevos y tiempo mínimo al volante**: herramienta gratuita que atrae enlaces).
- «mejor lector OBD2 para circuito» (con afiliados), «app telemetría OBD2 Android circuito».
- Páginas por circuito: «Kartpetania: trazado, tramos y récords con Box Box», generadas a partir de las pistas guardadas. Una página por circuito = SEO local.
- Calendario de resistencias de karting en España (página viva, actualizada cada mes). Es muy enlazable, sirve para captar organizadores y nadie lo tiene completo.

Coste: 0 €; 2–4 h por semana. Resultados en 4–9 meses.

### 3.7 ASO en Google Play

- **Título** (30 caracteres): «Box Box: Radio y Telemetría» o «Box Box – Box, Pit y Carrera».
- **Descripción breve** (80): «Comunica box y piloto con voz, tiempos en vivo, OBD2 y GPS. Para karting y track days.»
- **Palabras clave en la descripción larga**: karting, resistencia, cronómetro de vueltas, lap timer, telemetría, OBD2, ELM327, track day, box, pit, piloto, equipo, banderas, circuito.
- **Capturas**: 1) bandera amarilla a pantalla completa; 2) pantalla Box con vueltas; 3) mapa con coches; 4) mensajes con voz «ENTRA YA»; 5) estadísticas (constancia, vuelta ideal); 6) clasificación del evento. Texto grande encima de cada captura.
- **Vídeo promocional** de 30 s.
- **Reseñas**: pedirlas al acabar una carrera, cuando el usuario ha visto su resumen (el mejor momento). Objetivo: 30 reseñas ≥ 4,5 en 6 meses.
- **Ficha en inglés, francés e italiano** a partir del mes 6 (resistencias de karting muy fuertes en Francia e Italia: 24 Heures Karting de Le Mans, 24 Hours Karting of Italy de CRG ([kartxpress.com](https://www.kartxpress.com/International/ArtMID/430/ArticleID/115884/All-set-for-the-9th-Edition-of-the-CRG-24-Hours-karting))).

**Riesgo de Play**: el uso de ubicación en segundo plano y del servicio en primer plano exige una declaración y un vídeo justificativo en la consola. Prepararlo bien porque es el motivo de rechazo más típico **[verificar la política vigente]**. La actualización propia de la APK (plugin `Updater`, que descarga e instala) **no está permitida en apps de Play**: hay que desactivarla en la versión de Play.

### 3.8 Referidos entre equipos (efecto red)

El bucle:

```
Organizador paga 1 evento → 20 equipos × 3-5 pilotos = 60-100 usuarios activados gratis
   → cada equipo prueba Box Box también en libre/entrenamiento
   → capitanes que corren otras ligas se lo piden a su otro organizador
   → nuevo organizador → …
```

Tácticas:
- **«Equipo invitado» en otra liga**: si un capitán lleva Box Box a una carrera cuyo organizador no lo usa, el organizador recibe una invitación automática («3 equipos de tu carrera ya usan Box Box. Activa la dirección de carrera gratis en esta edición»).
- **Crédito por referir a un organizador**: 1 temporada de Box Box Pro gratis al equipo que trae un organizador que paga.
- **Resumen del evento compartible** con marca del organizador y «Hecho con Box Box» (marca de agua discreta).
- **Rivalidad**: «Tu equipo vs. el equipo X: constancia» como imagen para Instagram.

### 3.9 Afiliados

- Amazon Afiliados en la lista de adaptadores OBD2 compatibles probados y de soportes para kart (comisión baja, unos céntimos por venta, pero sostiene el contenido).
- Más adelante, programa de afiliados para **instructores de conducción y creadores**: 20–30 % del primer año de cada organizador o equipo que traigan.

### 3.10 Ferias y eventos

Las ferias generalistas cuestan mucho y convierten poco para este producto. Mejor ir a **los propios eventos del nicho** como participante o con mesa:
- Resistencias de karting (todas las de la lista), en especial **las 24 h** (Osona en julio, Kartpetania): con 20 equipos y 24 h, todos los boxes pasan por tu carpa.
- Track days de 8000vueltas y similares (ir como participante con el coche y el OBD).
- Retromóvil Madrid (12–13/12/2026) solo si se apuesta por clásicos y regularidad; ahora no ([eventseye.com](https://www.eventseye.com/ferias/cst3_ferias_espana_automovil-general.html)).
- Pruebas del CER, TCR Spain (Jarama en febrero, Navarra en octubre) y del Campeonato de España de Karting para hacer contactos y conocer a gente de los circuitos, sin stand.

---

## 4. Embudo, precios y métricas

### 4.1 Modelo de precios propuesto (validar en los 3 primeros organizadores)

| Plan | Para quién | Precio orientativo | Incluye |
|---|---|---|---|
| **Piloto** | Todos | Gratis siempre | App, perfil, estadísticas personales, equipo para entrenar |
| **Equipo Pro** | Capitanes | 4,99 €/mes o **39 €/temporada** | Historial ilimitado, estadísticas avanzadas (comparativa de pilotos, relevos), exportar CSV/vídeo, alertas personalizadas |
| **Evento** | Organizador ocasional | **49 € (hasta 15 equipos) / 89 € (hasta 40 equipos)** por evento, o 3–5 € por equipo inscrito | Dirección de carrera, mapa, clasificación en vivo, resumen con marca. Los equipos del evento tienen funciones Pro durante el evento |
| **Temporada organizador** | Liga o circuito recurrente | **390–790 €/año** (eventos ilimitados) | Lo anterior + logo del circuito, página pública de la liga, ranking de temporada, soporte el día de la carrera |
| **Track day** | Organizador de tandas | 3–5 € por participante o 99 € por jornada | Banderas, mapa e informe con marca para cada cliente |

Razonamiento: una resistencia de 20 equipos a 75–300 € por equipo factura entre 1.500 y 6.000 €. Cobrar 49–89 € es menos del 3 % y el organizador puede repercutir 3–5 € por equipo con un «Box conectado incluido». Para un track day de 20 coches a 325 €, 99 € es el 1,5 %.

**Dinero real del primer año: viene de los organizadores, no de los equipos.** El plan Equipo Pro es un extra.

### 4.2 Embudo y definiciones

**Organizadores (B2B)**

| Etapa | Definición | Objetivo de conversión |
|---|---|---|
| Lista | Organizador cualificado (≥ 6 eventos al año) | 50 en el mes 1 |
| Contactado | Mensaje enviado | 100 % de la lista en 6 semanas |
| Conversación | Ha contestado o llamado | 30–40 % |
| Demo | Ha visto el producto | 50 % de las conversaciones |
| Piloto gratis | Fecha cerrada | 40–50 % de las demos |
| Pago | Segundo evento pagado o temporada | 50 % de los pilotos gratis |
| Recurrente | ≥ 3 eventos pagados | 70 % de los que pagan |

De 50 cuentas → ~17 conversaciones → ~8 demos → ~4 pilotos → **~2 de pago en 90 días**. Es lento y es normal.

**Equipos y pilotos (B2C)**

| Métrica | Definición | Objetivo |
|---|---|---|
| **Activación de equipo** | Ha completado ≥ 10 vueltas con GPS y ha recibido ≥ 1 mensaje del box en la misma sesión | ≥ 60 % de los equipos registrados en un evento |
| Activación de piloto | Ha hecho ≥ 1 vuelta cronometrada | ≥ 75 % de los pilotos de un equipo activado |
| Momento «ajá» del organizador | Ha mandado ≥ 1 bandera y la han visto ≥ 80 % de los equipos | 100 % de los eventos piloto |
| Retención de equipo (M1) | Vuelve a usarla en otra sesión (evento o libre) en 30 días | ≥ 35 % |
| Retención de equipo (temporada) | ≥ 3 sesiones en 6 meses | ≥ 25 % |
| Conversión a Equipo Pro | Equipos activados que pagan | 5–10 % |
| Retención de organizador | Organizadores que repiten al trimestre siguiente | ≥ 80 % |
| Coeficiente viral | Nuevos organizadores traídos por equipos / organizadores activos al año | ≥ 0,5 |
| Fiabilidad | % de tiempo de carrera con todos los coches conectados | ≥ 95 % |

### 4.3 Objetivos numéricos

| | 90 días (ene-2027) | 6 meses (abr-2027) | 12 meses (oct-2027) |
|---|---|---|---|
| Eventos reales con Box Box | 3–4 | 12–15 | 40–60 |
| Organizadores de pago | 1–2 | 4–5 | 8–10 |
| Equipos que han corrido con la app | 50–70 | 150–250 | 400–600 |
| Pilotos registrados | 200–300 | 600–900 | 1.500–2.500 |
| Equipos Pro de pago | 0–5 | 15–25 | 40–80 |
| Ingresos mensuales recurrentes (aprox.) | 50–150 € | 400–700 € | 1.000–2.000 € |
| Instalaciones en Play | 150 | 800 | 2.500 |
| Seguidores Instagram/TikTok | 500 | 2.000 | 5.000 |

Los números son realistas para una persona sola en un nicho. El éxito a 12 meses es **demostrar que los organizadores repiten y que cada evento trae al menos medio organizador nuevo**. Con eso se puede plantear Francia, Italia y Portugal o buscar inversión o un socio.

### 4.4 Panel mínimo (una hoja de cálculo)

Hoja semanal: contactos, respuestas, demos, pilotos, eventos, equipos activados, sesiones fuera de evento y caídas o incidencias. Sacar de la base de datos con una consulta SQL: equipos con ≥ 10 vueltas por semana, sesiones por equipo y por tipo (`laps.kind`).

---

## 5. Plan de 90 días (05/10/2026 → 03/01/2027) y hoja de ruta a 12 meses

Dificultad: B = baja, M = media, A = alta. Coste aproximado en euros. Dedicación supuesta: 10–15 h a la semana.

### 5.1 Semana a semana

| Sem. | Fechas | Acciones | Dific. | Coste |
|---|---|---|---|---|
| 1 | 05–11 oct | Probar en pantalla y en el coche todo lo del 03/10 (banderas, participar, sin OBD) con 3 móviles. Pasar Render a pago. Buscar «Box Box» en OEPM y EUIPO y decidir el nombre final y el dominio | M | 7 $/mes + 15 € |
| 2 | 12–18 oct | Dominio, correo y landing v1 (ver §6.1). Política de privacidad. Cuenta de Google Play Console y prueba cerrada (pedir testers a amigos y a pilotos conocidos) | M | 25 $ |
| 3 | 19–25 oct | **Vídeo demo de 40 s** (bandera en 3 móviles + box + mapa). Lista de 50 organizadores en la hoja. Instagram + TikTok con los 3 primeros clips | B | 0 |
| 4 | 26 oct–1 nov | Primer lote de 20 contactos (WhatsApp/email). Prueba de carga: 20 clientes simulados en un evento + 1 h con la pantalla apagada. Comprar soportes y 2–4 Android de segunda mano | M | 150–250 € |
| 5 | 2–8 nov | Segundo lote de 20 contactos y seguimiento del primero. 2–3 demos. **Inscribirse como equipo** en una resistencia cercana y usar Box Box en tu box | M | 75–300 € |
| 6 | 9–15 nov | Demos. Cerrar fecha del **evento piloto nº 1** (nov-dic). Preparar la pista del circuito en la app. Arreglar lo que salió mal en la carrera de la semana 5 | M | 0 |
| 7 | 16–22 nov | Kit del evento: instrucciones de 1 página con QR, vídeo de «cómo unirse», mensaje para los capitanes. Prueba en ese circuito un día de tandas (cobertura, GPS) | M | 30–60 € |
| 8 | 23–29 nov | **Evento piloto nº 1**. Grabar todo. Encuesta en 48 h | A | 50 € (viaje) |
| 9 | 30 nov–6 dic | Caso de éxito nº 1 (página + vídeo de 90 s + post del organizador). Proponer al organizador el siguiente evento de pago con descuento de lanzamiento. Arreglos de producto según el feedback | M | 0 |
| 10 | 7–13 dic | Tercer lote de contactos **con el caso de éxito**. Cerrar el evento piloto nº 2 (otro organizador) y, si se puede, el primer evento de pago. Publicar en Play (producción) si la prueba cerrada ha terminado | M | 0 |
| 11 | 14–20 dic | **Evento nº 2**. Primer contacto con 5 organizadores de track days (temporada de primavera). Guía SEO «cómo organizar una resistencia de karting» + calculadora de relevos | M | 0 |
| 12 | 21–27 dic | Semana floja (Navidad): página de precios, deck para organizadores y plan de contenido de enero. Grupo de capitanes en WhatsApp | B | 0 |
| 13 | 28 dic–3 ene | Revisión de los 90 días con números. Decidir: ¿karting o track days como foco en el primer semestre? Calendario de eventos de enero a junio con 3 organizadores | B | 0 |

**Coste total de los 90 días: ~400–800 €** (más la inscripción propia en carreras si no se tiene equipo).

**Lo que NO hacer en estos 90 días**: iOS, rallys de regularidad, publicidad pagada, ferias, versión en inglés, nuevas funciones que nadie haya pedido en un evento real.

### 5.2 Hoja de ruta a 12 meses

| Trimestre | Foco comercial | Producto (solo lo que pide la venta) | Dificultad | Coste aprox. |
|---|---|---|---|---|
| **T1 · oct–dic 2026** | 2–3 eventos piloto, primer caso de éxito, 1–2 organizadores de pago | Fiabilidad con 20+ coches, Play Store, resumen del evento compartible | M–A | 400–800 € |
| **T2 · ene–mar 2027** | 4–5 organizadores de pago; primeras temporadas de liga; 2–3 track days de prueba en Jarama o Navarra | Exportar CSV/GPX de vueltas; logo del organizador en el evento; **gestión de relevos y tiempo mínimo al volante** (ya en el «pendiente» del proyecto y clave en resistencia) | M | 300–600 € (viajes, material) |
| **T3 · abr–jun 2027** | Temporada alta: 15–20 eventos; programa de referidos; 3–5 colaboraciones con creadores; primeros Equipo Pro | Plan Equipo Pro con pago (Stripe o Google Play Billing); página pública de la liga y ranking de temporada; vídeo con overlay de telemetría | A | 500–1.500 € (creadores en especie, Stripe) |
| **T4 · jul–sep 2027** | **Las 24 h de verano** (Osona en julio y otras) como gran escaparate; preparar la entrada en Portugal, Francia e Italia (fichas de Play traducidas, 5 contactos por país) | Modo 24 h (batería, relevos de móvil, reconexión); traducciones; valorar iOS solo si ≥ 25 % de pilotos lo pide | A | 800–2.000 € |

Hitos de decisión:
- **Mes 3**: si ningún organizador quiere repetir el piloto (ni gratis) → el problema es el producto o el segmento; probar con track days.
- **Mes 6**: si hay ≥ 4 organizadores de pago y el NPS de capitanes es ≥ 30 → invertir en Equipo Pro y referidos.
- **Mes 9**: si los ingresos mensuales pasan de 1.000 € con retención de organizadores ≥ 80 % → buscar un socio comercial o una pequeña ronda de business angels del sector, o el programa de ENISA para jóvenes emprendedores **[verificar condiciones]**.

---

## 6. Materiales necesarios

### 6.1 Landing page (una sola página, en español; versión en inglés en el T4)

| Bloque | Texto propuesto |
|---|---|
| **Hero** | **Titular:** «La radio y el muro de boxes de tu equipo, en el móvil.» · **Subtítulo:** «Comunicación box↔piloto con voz, tiempos en vivo, GPS y OBD2. Y para el organizador: banderas, mapa y clasificación en directo para todos los equipos.» · **Botones:** «Probar gratis en mi próxima carrera» (organizadores) · «Descargar en Google Play» (equipos) · Vídeo de 40 s en bucle sin sonido |
| **El problema** | «Pizarras que nadie lee a 70 km/h. Banderas que medio pelotón no ve. Relevos calculados con el cronómetro del móvil. Si corres resistencias, lo conoces.» |
| **Cómo funciona (3 pasos)** | 1) «El piloto pone el móvil en el soporte (con o sin OBD2).» 2) «El box lo ve todo en el portátil: vueltas, parciales, ritmo y alertas.» 3) «El organizador manda banderas y avisos a todos a la vez y ve quién los ha visto.» |
| **Para organizadores** | Dirección de carrera digital · Mapa en directo · Clasificación en vivo por sesión (entrenamiento o carrera) · Resumen con tu marca · «No sustituye a tu cronometraje. No se instala nada.» · Botón: «Quiero probarlo gratis» → formulario corto (nombre, circuito o serie, próxima fecha, nº de equipos, WhatsApp) |
| **Para equipos** | Mensajes con voz dentro del casco y respuesta OK/NO/PROBLEMA · Botones grandes para guantes (Avería, Salgo a box, Repostar, Pinchazo) · Alarmas de temperatura y rpm con OBD2 · Constancia y vuelta ideal por piloto |
| **Prueba social** | Logos de los circuitos que lo usan, 2 citas, números del caso de éxito («18 equipos, 412 mensajes, amarillas vistas en 4 s de media») |
| **Requisitos honestos** | «Móvil Android en el coche (el box puede usar cualquier navegador). OBD2 ELM327 Bluetooth opcional (lista de adaptadores probados).» |
| **Precios** | Resumen de 3 planes + enlace a la página de precios |
| **FAQ** | ¿Funciona sin cobertura? (cola sin conexión y envío en ráfaga) · ¿Gasta mucha batería? · ¿Está permitido en mi carrera? (lo decide el organizador) · ¿Y en un kart de alquiler sin OBD? (sí, modo GPS) · ¿Mis datos? (RGPD, eliminar cuenta) |
| **Cierre** | «¿Tienes una resistencia este mes? Te ayudo a montarla con Box Box gratis.» + WhatsApp directo |

Técnica: puede ser una ruta estática servida por el mismo servidor o una página aparte en un hosting gratuito. Medir con Plausible o GoatCounter (sin cookies, sin banner).

### 6.2 Deck para organizadores (8–10 diapositivas, para enseñar en el móvil o enviar en PDF)

1. Portada: logo + frase.
2. El problema en el box y en la dirección de carrera (fotos reales de pizarras y banderas).
3. Box Box en una imagen: piloto, box y organizador conectados.
4. Lo que ve el organizador (capturas del panel, bandera, mapa y clasificación).
5. Lo que ven los equipos.
6. Qué hace falta el día de la carrera (y qué no: ni antenas, ni cambiar el cronometraje).
7. Caso de éxito con números.
8. Precios y oferta de lanzamiento («primer evento gratis, temporada al 50 % para los 5 primeros»).
9. Próximo paso: fecha del evento piloto.

### 6.3 Vídeo demo

- **40 s (hero y WhatsApp)**: 0–5 s pizarra en un box real; 5–15 s el organizador pulsa «Amarilla» → 3 móviles se ponen amarillos y hablan; 15–25 s el box escribe «ENTRA YA» → el piloto pulsa OK; 25–35 s mapa con coches y clasificación; 35–40 s logo + «Prueba gratis».
- **90 s (caso de éxito)**: testimonio del organizador + imágenes del evento.
- **3 min (tutorial)**: cómo se une un equipo con el código del evento.

### 6.4 Casos de estudio (plantilla de 1 página)

Cliente y evento · Situación antes · Qué se hizo (montaje en X min, N equipos) · Resultados en números (equipos conectados, mensajes, banderas y tiempo medio de lectura, NPS) · Cita del organizador y de un capitán · Fotos · «¿Quieres lo mismo en tu carrera?».

### 6.5 Página de precios

- Tres columnas: **Piloto (gratis)** · **Equipo Pro (39 €/temporada)** · **Organizador (desde 49 €/evento o temporada)** + fila «Track days: pregúntanos».
- Debajo: «Tu primer evento como organizador es gratis», «Sin permanencia», «IVA incluido» o no (decidirlo y ser coherente), FAQ de facturación.
- Al principio se puede cobrar por **transferencia o Bizum con factura** a organizadores, sin pasarela de pago: la pasarela solo hace falta para Equipo Pro. Darse de alta como autónomo cuando haya ingresos recurrentes **[consultar con una gestoría la tarifa plana vigente]**.

### 6.6 Otros

- Hoja A5 con QR para el *briefing* y la mesa de inscripción.
- Pegatinas «Box Box» para karts y cascos (50 € el lote): cada foto de la carrera es publicidad.
- Lista de adaptadores OBD2 compatibles probados (empezar por el KUULAA clásico ya probado).
- Plantilla de mensaje para que el organizador avise a sus capitanes.

---

## 7. Errores típicos a evitar

1. **Vender antes de que funcione en un evento real con 15–20 coches.** En este nicho todo el mundo se conoce: un fallo en una 24 h se comenta durante meses. Primero fiabilidad (servidor de pago, pruebas de carga, pantalla apagada, mala cobertura).
2. **Querer sustituir el cronometraje oficial.** Los circuitos tienen transpondedores y Apex o similares. Si Box Box pretende ser el resultado oficial, entra en conflicto con el circuito y con las reclamaciones de los equipos. Box Box es la capa de comunicación y la «clasificación en vivo informativa».
3. **Olvidar la seguridad y el reglamento.** Un móvil mal sujeto en un kart es un proyectil; un piloto mirando la pantalla es un riesgo. Mensajes cortos, voz por encima de texto, botones grandes y confirmar con el organizador si permite dispositivos a bordo. Nunca prometer «es legal en tu campeonato»: lo decide el organizador. En karting federado, olvidarse por ahora.
4. **Abrir demasiados frentes**: karting + track days + regularidad + iOS + Europa a la vez. Un segmento, una región (la tuya) y un caso de éxito, y después el siguiente.
5. **Cobrar a los pilotos primero.** Los pilotos son el canal y el efecto red. El que paga es el organizador (y, más tarde, el capitán). Una barrera de pago en el piloto mata la viralidad.
6. **Hacer funciones en vez de llamadas.** El producto ya tiene mucho (banderas, sesiones, sin OBD, estadísticas). Durante 90 días, la regla es: nada nuevo si no lo ha pedido un organizador o un capitán en un evento real (excepción: relevos y tiempo mínimo al volante, y exportar CSV para contenido).
7. **Distribuir la APK fuera de Play a desconocidos.** Sirve para amigos, no para vender. El «origen desconocido» asusta, y la autoactualización no está permitida en Play: separar la versión de Play.
8. **Ignorar la parte iOS del box.** El móvil del coche tiene que ser Android, pero el box y el organizador deben funcionar perfecto en Safari (iPhone y iPad) y en cualquier portátil. Probarlo.
9. **Precios demasiado bajos o «gratis para siempre» a organizadores.** El piloto gratis es una prueba de 1–2 eventos con fecha de fin y a cambio de un caso de éxito. Si un organizador no paga 49 € por un evento que factura 3.000 €, no valora el producto.
10. **No recoger pruebas.** Cada evento sin vídeo, cita y números es un evento perdido para la venta. Pedir permiso para grabar, y respetar el RGPD con la imagen de los pilotos (consentimiento en la inscripción o pixelar).
11. **Marca sin comprobar.** Gastar en logo, dominio y pegatinas antes de mirar la OEPM y EUIPO.
12. **Hacerlo todo solo el día de la carrera.** Con 20 equipos, una persona no puede dar soporte, grabar y llevar el panel del organizador. Para cada evento piloto, llevar un ayudante (un amigo piloto) y un guion de soporte de 1 página.

---

### Fuentes principales

- Soul Racing Kart, campeonatos de resistencia: https://soulracingkart.com/campeonatosderesistencia/ · https://soulracingkart.com/eventosderesistencia/
- Karting Club Los Santos, 24 h SWS por equipos: https://www.kartingclublossantos.com/eventos/61-24-horas-sws-de-resistencia-por-equipos/
- 24 Horas Kartpetanas: https://www.facebook.com/24hKartpetanas/ · https://www.autofacil.es/limits-karting-team-correra-24-horas-karpetanas/
- Karting Vendrell, race days: https://kartingvendrell.com/tienda/racedays/
- Karting de Asturias, resistencias: https://www.vivirasturias.com/karting/i/54828303/circuito-de-karting-de-asturias
- Universal Games: https://universalgames.es/carreras-de-resistencia/
- 6 Hores Trofeu Mercat del Ram: https://naciodigital.cat/osona/esports/equip-open-guanya-amb-autoritat-les-6-hores-de-resistencia-de-karting-trofeu-mercat-del-ram.html
- Sodi World Series 2025/2026: https://www.sodiwseries.com/en-gb/news/sodi-world-series-a-record-breaking-2025-season-and-stronger-ambitions-for-2026-183.html · https://www.sodikart.com/es-es/news/press-release/sws-une-saison-record-et-des-ambitions-venir-189.html
- 8000vueltas: https://www.autofacil.es/track-days-calendario-8000v/
- CM3 en el Jarama: https://soymotero.net/noticia/rueda-con-cm3-en-el-circuito-del-jarama-10363/
- Trackrat Club: https://trackrat.wpprovider.nl/circuits/ · Gedlich Racing: https://gedlich-racing.com/en/?p=7602
- Formato de track day: https://www.highmotor.com/que-es-un-track-day.html
- Apps de telemetría y precios: https://es.motor1.com/news/463217/mejores-apps-telemetria-telefono-movil/
- Race Cockpit (competidor): https://apps.apple.com/app/id6757126834
- Apex Timing live timing: https://www.apex-timing.com/en/live-timing/ · Sistemas de cronometraje de karting: https://bmileisure.com/kart-timing-systems/
- TCR Spain 2026: https://www.touringcartimes.com/2025/11/05/tcr-spain-reveals-2026-schedule/ · CER: https://www.motorpasion.com/formula1/el-cer-visito-el-jarama
- Campeonato de España de Karting en MotorLand 2026: https://www.festivalesdeespana.com/festival/campeonato-espana-karting-motorland-alcaniz
- Regularidad y Blunik: https://www.km77.com/revista/teletransporte/eco-rallye-comunitat-valenciana-2017/ · https://www.motor16.com/las-ultimas-noticias/cantabria-classic-rally/ · https://avilared.com/art/8710/avila-se-convierte-en-sede-permanente-del-rally-de-espana-historico
- Canales de motor en España: https://www.diariomotor.com/noticia/canales-youtube-motor-espana/
- Simracers españoles: https://www.autofacil.es/simracers-mejores-pilotos-espanoles-esports/
- 24 Hours Karting of Italy (CRG): https://www.kartxpress.com/International/ArtMID/430/ArticleID/115884/All-set-for-the-9th-Edition-of-the-CRG-24-Hours-karting
- Ferias del automóvil en España: https://www.eventseye.com/ferias/cst3_ferias_espana_automovil-general.html

---

# Parte 4 · Arquitectura y plan de escalado


> Fecha: 2026-10-05 · Revisado sobre `main` @ `1d319f8` · Solo lectura (no se ha modificado el repo).
> Precios verificados hoy; las fuentes están al final. Las cifras de capacidad salen de los intervalos reales del
> código y de una **prueba de carga local** (script propio con `socket.io-client`, servidor con PGlite en memoria).

### Resumen ejecutivo

- La arquitectura es la correcta para **un equipo o unos pocos eventos pequeños**: un proceso Node, salas Socket.IO por
  equipo/evento y Postgres. Está limpia y es pequeña (≈1.800 líneas de servidor). No hay que reescribirla, hay que **quitarle
  techos uno a uno**.
- **El primer techo no es la CPU, son el plan gratuito y la base de datos.** Render Free (0,1 CPU, se duerme, puede
  reiniciarse cuando quiera) y Neon Free (1 GB): **un solo evento de 100 coches durante 8 h genera ≈ 2,9 M filas de
  `samples` (≈ 450-500 MB), la mitad del almacenamiento gratuito.**
- El techo de un proceso Node, medido: **≈ 1.000 coches a 4 Hz con un espectador cada uno ocupan ≈ 0,7 núcleos y la p99 de
  latencia sube a ≈ 60 ms.** Con 0,5 CPU (Render Starter) el límite práctico está en ≈ 300-400 coches. Con 0,1 CPU (Free),
  en ≈ 60-80.
- Para pasar de una instancia a varias hay que sacar de la memoria **seis cosas**: piloto al volante, parada en boxes, presencia,
  banderas, cronómetro de la vuelta en curso y caché de equipos. Además `kick()` tiene que dejar de recorrer todos los sockets.
- **Decisión de stack:** seguir en **Render + Neon** hasta varias instancias (Fases 0-2). Añadir **Valkey** (Key Value de Render)
  con el adapter de Socket.IO en Fase 2. Pasar el tiempo real a **Fly.io** con afinidad por evento (`fly-replay`) solo en la Fase 3,
  cuando el tráfico saliente y la multirregión pesen. **Postgres hasta el final** (particionado y rollups). TimescaleDB y
  ClickHouse solo si un día se analiza a fondo la telemetría cruda.

---

## 1. Estado actual y cuellos de botella (con referencias)

### 1.1 Estado en memoria (impide más de una instancia y se pierde al reiniciar)

| Qué | Dónde | Problema |
|---|---|---|
| Estado por equipo: `team`, `driver`, `pit`, `lap` (cronómetro), `online` | `server/live.js:8` (`states`), `:35-40` (`state()`) | Si Render reinicia (Free lo hace sin avisar, y cada deploy también), se pierden la vuelta en curso, el piloto al volante y la parada abierta. **Nunca se borra nada del `Map`**: cada equipo que se conecta alguna vez queda en RAM (fuga lenta) |
| Banderas de dirección de carrera + `seen` | `server/live.js:26` (`flags`), `:30-34` | Un reinicio en mitad de una bandera roja la borra. El propio `CONTEXTO.md` lo apunta como pendiente (punto 6) |
| Presencia | `live.js:145-152` (`st.online`) | Contador local de un proceso. Con dos instancias, cada una ve la mitad |
| Historial de mensajes BOX ↔ piloto | **No existe en el servidor**: `live.js:213-218` solo reenvía. El registro vive en el estado de React (`src/views/Box.jsx:24`) | Al recargar BOX se pierde el registro. **Un mensaje a un piloto que en ese momento está sin cobertura se pierde**: el buffer de Socket.IO solo guarda lo que *emite* el cliente desconectado, no lo que el servidor le manda |
| `kick(userId)` | `live.js:87-93` | `io.fetchSockets()` recorre **todos** los sockets del proceso y después todos los `states`. Coste O(conexiones) en cada cambio de equipo o contraseña. Con adapter Redis se convierte en una petición a todo el clúster |
| `setFlag` | `live.js:30-34` | Hace un `select` y luego un `emit` por equipo. Bastaría con emitir a la sala del evento si los equipos que participan se unieran también a una sala `event-cars:<id>` |

### 1.2 Infraestructura

| Qué | Dónde | Problema |
|---|---|---|
| `plan: free`, `numInstances: 1` | `render.yaml:7-8` | 0,1 CPU y 512 MB. Se duerme a los 15 min sin tráfico (≈ 1 min en despertar). Render **puede reiniciarlo en cualquier momento** y **suspender** servicios gratuitos con "un volumen de tráfico saliente inusualmente alto" hacia bases de datos externas, que es justo lo que hacen las escrituras a Neon |
| Health check en `/` | `render.yaml:11` | Comprueba que se sirve `index.html`, no que la BD o el bucle de eventos respondan |
| La APK carga la web remota | `capacitor.config.json` (`server.url`) | El dominio `boxracing.onrender.com` queda fijado en cada APK. Cambiar de host sin un **dominio propio** obliga a publicar otra APK y a mantener una redirección, como ya pasó con `cencerro-racing` |
| CI | `.github/workflows/android.yml` | Solo compila la APK. **Ningún workflow ejecuta `npm test`** antes de que el autodeploy de `main` llegue a producción (`render.yaml:12`) |
| APK de depuración | `android.yml` (`assembleDebug`, alias `androiddebugkey`) | Sirve para instalar a mano, pero **no vale para Play Store**, que pide un AAB de release y Play App Signing |
| Teselas Esri sin cuenta | `README.md` («Esri sin cuenta solo cubre uso no comercial») | **Bloqueante legal en cuanto se cobre.** Hace falta una cuenta Esri/ArcGIS o MapTiler/Stadia |

### 1.3 Ruta caliente de telemetría

| Qué | Dónde | Detalle |
|---|---|---|
| Envío a 4 Hz por defecto | `src/lib/store.js:13` (`pollMs: 250`), bucle en `src/lib/gateway.js:220-247` | 4 mensajes/s por coche, de ≈ 270 B de JSON cada uno |
| El servidor **engorda** cada paquete | `live.js:189` | Añade `limits` (todo el objeto de umbrales), `driver`, `car`, `lapStartedAt` y `lapSplits` a **cada** paquete: sale con ≈ 600 B, más del doble de lo que entra. Los `limits` solo cambian cuando se editan |
| Una muestra por segundo, sin agrupar | `live.js:182-185` | Un `INSERT` por fila y por coche cada segundo, sin `await` ni contrapresión. Si Neon va lento, las promesas se acumulan en memoria detrás de un pool de **5 conexiones** (`server/db.js:8`) |
| Ráfaga al recuperar señal | `gateway.js:49-53` (lotes de 500) y `live.js:163` (`slice(0, 1000)`) | Cuando todo el circuito pierde 4G a la vez y lo recupera, cada coche manda hasta 5.000 paquetes. Eso dispara **cientos de `INSERT` por coche en el mismo tick** |
| Situar en el trazado | `live.js:170` → `server/laps.js:32` (`locate`) | Recorre linealmente hasta 2.000 segmentos por paquete (`api.js:140`). Ahora mismo es barato, pero crece con la longitud del trazado |
| Estadísticas al cerrar cada vuelta | `src/views/Stats.jsx:24-25`, `Box.jsx:30-31` | Cada BOX abierto recarga `today` **y `month`** cada 60 s **y con cada vuelta**. La consulta de 30 días agrega todas las `samples` del equipo (`api.js:350-355`): ≈ 864 k filas por carga si se rueda 8 h al día. Con N pantallas son N × 2 consultas por vuelta |
| Pantalla del organizador | `src/views/Events.jsx:110` | La clasificación se pide cada 30 s. Es barato: agrupa `laps`, que tiene pocas filas |

### 1.4 Base de datos

- **Esquema dentro del arranque** (`db.js:19-120`): `create … if not exists`/`alter …` en cada arranque, y un
  `update laps set kind = 'race' …` (`db.js:117`) que **recorre `laps` entera en cada deploy**. Con varias instancias arrancando a
  la vez hay riesgo de bloqueos. Conviene pasarlo a migraciones numeradas que se ejecuten una vez (`preDeployCommand`).
- `samples` no tiene clave primaria, ni particionado, ni retención. Lleva **dos índices** (`samples_team_time` y
  `samples_driver_time`), así que cada fila cuesta ≈ 150-170 B en disco.
- Backups: con Neon Free solo hay **6 h de PITR** (restauración a un instante, hasta 1 GB). No hay ningún volcado propio.

### 1.5 Seguridad y autenticación

| Hallazgo | Dónde | Riesgo |
|---|---|---|
| **No hay límite de intentos** en `/api/login` ni en `/api/register` | `api.js:155-167` | Fuerza bruta de contraseñas y **agotamiento de CPU**: scrypt va al threadpool de libuv (4 hilos), y con 0,1 CPU un bucle de logins tumba el servicio en plena carrera. Lo apunta `CONTEXTO.md` (punto 6) |
| Tokens HMAC de 30 días en `localStorage`, sin forma de revocarlos salvo cambiando la contraseña | `auth.js:8, 22-24`, `session.js` | Un token robado vale 30 días. Aceptable ahora. Más adelante: lista de revocación o `token_version` |
| `pilot`/`msg`/`ack` reenvían el payload del cliente tal cual (`{...d}`) | `live.js:214-216` | Cualquier miembro puede difundir hasta 1 MB por mensaje (el `maxHttpBufferSize` por defecto) y a cualquier ritmo. React escapa el texto, así que no hay XSS, pero sí abuso |
| Sin cabeceras de seguridad (CSP, HSTS, `X-Frame-Options`) | `server/index.js:30` | Clickjacking y endurecimiento básico |
| Sin límite por socket | `live.js:157-201` | Un cliente con un token válido puede mandar miles de paquetes por segundo |
| Datos personales de ubicación (GPS de personas en la UE) sin política de retención, sin exportación y sin registro de tratamientos | `samples.lat/lng` | Ver §5 (RGPD) |

### 1.6 Frontend

- **Bundle**: `dist/assets/index-*.js` ocupa **615 KB (180 KB gzip)** en un único chunk, más 62 KB de CSS y 21 ficheros de fuente
  (incluidas cirílica, griega y vietnamita, que no hacen falta). Leaflet, las vistas de admin y organizador y las estadísticas
  podrían cargarse con `React.lazy`. Afecta al primer arranque en pista con 3G, no a la escala del servidor.
- El service worker (`public/sw.js`) va primero a la red y guarda en caché todo lo que pasa por él. Está bien para abrir sin
  cobertura.

---

## 2. Capacidad: cálculos y medición

### 2.1 Por coche (intervalos reales del código)

| Magnitud | Cálculo | Valor |
|---|---|---|
| Mensajes que entran | `pollMs` = 250 ms (`store.js:13`) | **4 msg/s** |
| Bytes que entran | ≈ 270 B JSON + marco Socket.IO/WS | ≈ 1,1 KB/s ≈ **4 MB/h** |
| Mensajes que salen por cada espectador del equipo | 4 msg/s × ≈ 600 B (`live.js:189`) | ≈ 2,4 KB/s ≈ **8,6 MB/h por espectador** |
| Típico: BOX + 1 miembro más | 2 espectadores | ≈ **17 MB/h por coche** de tráfico saliente |
| Organizador | `event:car` a 1 Hz (`live.js:194-200`), ≈ 300 B | ≈ 1 MB/h por coche y por pantalla de organizador |
| Filas de `samples` | 1/s (`live.js:182`) | **3.600/h · 28.800 por día de 8 h · 86.400 en una resistencia de 24 h** |
| Filas de `laps` | ≈ 1 por vuelta de 90 s | ≈ 40/h (irrelevante) |
| Disco de `samples` (con 2 índices) | ≈ 160 B × 3.600 | ≈ **0,55 MB/h · 4,6 MB por día de 8 h** |

**Ejemplo, evento de 30 coches durante 8 h:** 120 msg/s de entrada, ≈ 240 msg/s de salida, 864 k filas (≈ 140 MB) y
≈ 4 GB de tráfico saliente. **Solo eso se come casi todo el ancho de banda incluido en Render Hobby** (5 GB al mes).

### 2.2 Medición local (un proceso, 1 espectador por coche, PGlite en el mismo proceso)

| Coches a 4 Hz | Mensajes entregados/s | CPU del servidor | p50 / p99 de latencia (emisión → recepción) |
|---|---|---|---|
| 100 | 400 | — | 1 / 4 ms |
| 400 | 1.600 | — | 1 / 8-15 ms |
| 1.000 | 3.990 | **≈ 67 % de un núcleo** | 1 / **51-67 ms** |

Hay que tomarlo como una cota orientativa: el generador de carga corría en la misma máquina (12 hilos de escritorio) y PGlite
mete el coste de los `INSERT` dentro del proceso. Un núcleo de Render compartido rinde menos.

### 2.3 Capacidad por plan (estimada a partir de lo medido, con margen ×1,5)

| Despliegue | Coches simultáneos (cómodo) | Eventos de ~20 coches | Primer límite que se alcanza |
|---|---|---|---|
| **Hoy: Render Free (0,1 CPU) + Neon Free** | **≈ 50-80** | 2-3 | Neon: 1 GB ≈ **200 días-coche de 8 h en total**, y 100 CU-h al mes. Render: 5 GB de salida ≈ 300 horas-coche al mes. Que se duerma o se reinicie |
| Render Starter (0,5 CPU) | ≈ 300 | ≈ 15 | CPU y bucle de eventos |
| Render Standard (1 CPU, 2 GB) | ≈ 600 | ≈ 30 | CPU. Node usa un solo núcleo |
| Render Pro (2 CPU) con 1 proceso | ≈ 700 | ≈ 35 | **Node no aprovecha el segundo núcleo** sin cluster o adapter |
| Varias instancias + adapter Valkey | lineal hasta ≈ 3-5 k | 150-250 | Fan-out de pub/sub y escrituras en Postgres |

**Conclusión:** para "miles de equipos y cientos de eventos simultáneos" (pongamos 300 eventos × 15 coches ≈ **4.500 coches,
18.000 msg/s de entrada, ≈ 40.000 de salida y 4.500 filas/s**) hacen falta escalado horizontal, escrituras por lotes, telemetría
más compacta y un tráfico saliente barato.

---

## 3. Plan por fases

Resumen:

| Fase | Objetivo | Dificultad | Esfuerzo (1 dev) | Infra/mes |
|---|---|---|---|---|
| 0 | No caerse en carrera, cerrar huecos de seguridad | Baja | **4-6 días** | **≈ 7-8 $** |
| 1 | Un nodo de producción fiable y observable (≈ 500 coches) | Media | **8-12 días** | **≈ 50-80 $** |
| 2 | Horizontal: miles de equipos, ≈ 100-200 eventos simultáneos | Alta | **15-25 días** | **≈ 250-450 $** |
| 3 | Escala global, multi-organizador comercial, multirregión | Alta | **30-50 días** | **≈ 900-2.000 $** |
| Transversal | iOS, tiendas, RGPD | Media-Alta | 15-25 días | 99 $/año Apple + 25 $ una vez Google |

### Fase 0 · Barato e inmediato (≈ 1 semana)

**Objetivo:** que un día de carrera no dependa de la suerte, y quitar los dos o tres agujeros que sí se van a explotar.

Pasos:
1. **Render Starter, siempre encendido** (7 $/mes, 0,5 CPU). Se quita el ping de cron-job.org. Mantener el workspace **Hobby**
   (0 $). Cambiar `plan: free` → `starter` en `render.yaml:7`.
2. **Dominio propio** (p. ej. `app.boxbox.es`, ≈ 10 €/año) en Render, y apuntar a él `capacitor.config.json` en la próxima APK.
   Así cambiar de host deja de exigir una APK nueva. Es lo que más barato sale ahora y más caro después.
3. **Limitar los intentos de login y registro**, sin dependencias: un `Map` de IP+email con ventana fija (p. ej. 5 fallos en
   15 min → 429) en `api.js:162`, y un tope global de scrypts simultáneos. Se pasa a Valkey en la Fase 2.
4. **Agrupar los `INSERT` de `samples`**: un buffer en memoria por proceso que vacía cada 1 s (o a las 500 filas) con un
   `INSERT … SELECT * FROM unnest($1::int[], $2::timestamptz[], …)`. Una sentencia por segundo en vez de N. Resuelve también la
   ráfaga de reconexión y la falta de contrapresión. ≈ 30 líneas.
5. **Telemetría más ligera**: dejar de añadir `limits` a cada paquete (`live.js:189`). Se mandan al conectar y en el evento
   `team`. La salida baja ≈ 40 %, y con ella el coste de ancho de banda.
6. **Validar en el borde de Socket.IO**: `new Server(http, { transports: ['websocket'], maxHttpBufferSize: 256e3 })`
   (`index.js:38`). En `pilot`/`msg`/`ack`, reenviar solo los campos conocidos y con el texto recortado. Limitar a ~20 eventos/s
   por socket (token bucket de 10 líneas).
7. **Persistir las banderas y el registro de BOX** en Postgres: tablas `event_flags (event_id pk, type, text, ts, seen int[])` y
   `team_messages (id, team_id, ts, dir, from_id, payload jsonb)`. Al conectar se mandan la bandera y los últimos 50 mensajes, y
   el piloto confirma los `msg` con un ack de Socket.IO. Así un reinicio o un piloto sin cobertura dejan de perder mensajes. Es
   el pendiente 6 del `CONTEXTO.md`.
8. **Expulsar del `Map`** de `states` el equipo que se queda sin sockets (después de unos 10 min sin conexiones ni telemetría).
9. **Que `/api/stats` del mes deje de recalcularse con cada vuelta**: en Box, `month` solo cada 10 min (`Stats.jsx:25` aplica a
   `today`). O mejor, en el servidor, una tabla de rollup diario (Fase 1).
10. **CI mínima**: un workflow `test.yml` con `npm ci && npm test` en cada push o PR. En Render, `autoDeployTrigger:
    checksPass`, para que no se despliegue un rojo.
11. **Sentry Developer** (gratis, 5 k errores al mes) en el servidor y en el cliente, y `/healthz` que haga `select 1` como
    `healthCheckPath`.
12. **Backup propio**: una GitHub Action nocturna con `pg_dump -Fc` hacia un bucket (Cloudflare R2, 10 GB gratis), retención de
    14 días. **Probar la restauración una vez.**

| | |
|---|---|
| Dificultad | Baja |
| Esfuerzo | 4-6 días |
| Coste | Render Starter 7 $ + Neon Free 0 $ + R2/Sentry 0 $ ≈ **7-8 $/mes** |
| Riesgos | Neon Free sigue topando en 1 GB y 100 CU-h (ver la Fase 1). El buffer de muestras pierde ≤ 1 s de muestras si el proceso cae, y es aceptable. Validar los payloads de `msg` puede romper clientes antiguos: aceptar campos desconocidos durante una versión |

### Fase 1 · Producción de un nodo, observable y con datos bajo control (≈ 2 semanas)

**Objetivo:** ≈ 500 coches simultáneos y decenas de eventos al mes, con métricas, retención y pruebas de carga que digan dónde
está el límite antes de llegar a él.

Pasos:
1. **Render Standard** (25 $/mes, 1 CPU, 2 GB) en cuanto un evento pase de ~150 coches o la p99 suba de 100 ms.
2. **Neon Launch** (pago por uso: 0,106 $/CU-h y 0,35 $/GB-mes, 7 días de PITR). Desactivar el *scale-to-zero* solo los días de
   evento, o dejarlo: el primer `INSERT` paga ≈ 0,5 s de arranque y la telemetría ya va en buffer.
3. **Migraciones fuera del arranque**: mover el `SCHEMA()` de `db.js` a `server/migrations/NNN.sql` con una tabla
   `schema_migrations`, y ejecutarlas en el `preDeployCommand` de Render. Quitar el `update laps` de cada arranque (`db.js:117`).
4. **Retención y particionado de `samples`** (Postgres nativo, sin extensiones):
   - `samples` particionada por mes (`partition by range (ts)`), con la partición siguiente creada por un cron (o `pg_partman` si
     Neon lo ofrece en PG18).
   - **Rollup**: tabla `samples_daily (team_id, driver_id, day, kind, track_id, n, sum_speed, max_rpm, …)`, que se mantiene en
     el mismo vaciado del buffer (upsert). `/api/stats` y `/api/me/stats` leen el rollup para los rangos de varios días y las
     crudas solo para "hoy".
   - **Política**: crudas 90 días (se borra la partición entera: instantáneo, sin `VACUUM`) y luego solo el rollup. La política
     se publica en la de privacidad.
   - Quitar uno de los dos índices de `samples` si el rollup cubre el caso del piloto (`samples_driver_time`).
5. **Observabilidad**:
   - Logs JSON de una línea (sin librería: `console.log(JSON.stringify({...}))`) con `teamId`, `eventId`, `latencyMs`. Se mandan
     a Better Stack o Grafana Cloud (planes gratuitos) con el *log stream* de Render.
   - Métricas de proceso en `/metrics` (formato Prometheus a mano): sockets abiertos, msg/s de entrada y salida, retraso del bucle
     de eventos (`perf_hooks.monitorEventLoopDelay`), tamaño del buffer de muestras, latencia de los `INSERT`.
   - Alertas: p99 del bucle de eventos > 50 ms, buffer > 10 k filas, errores 5xx, health check.
6. **Prueba de carga reproducible**: **Artillery** con su motor `socket.io` (k6 no habla el protocolo de Socket.IO sin
   reimplementar el framing). El escenario: N coches a 4 Hz, 2 espectadores cada uno, 1 organizador por cada 20 coches, logins
   en paralelo y una ráfaga de reconexión de 1.000 paquetes. Ejecutarla contra un *preview environment* antes de cada evento
   grande. El script de esta auditoría puede ser la base.
7. **Seguridad**: cabeceras CSP/HSTS/`X-Frame-Options`/`Referrer-Policy` en `index.js`. `token_version` en `users` para
   revocar sesiones sin cambiar la contraseña. Registro de auditoría (quién cambió roles o borró eventos).
8. **Frontend**: `React.lazy` para Admin, Events, Stats y Leaflet; quitar los subconjuntos de fuente que no se usan
   (`@fontsource/.../latin.css`). Debería quedar en < 120 KB gzip en la carga inicial.
9. **Mapas con licencia comercial** (cuenta de ArcGIS Location Platform o MapTiler) antes de cobrar a nadie.

| | |
|---|---|
| Dificultad | Media |
| Esfuerzo | 8-12 días |
| Coste | Render Standard 25 $ + Neon Launch ≈ 15-40 $ + tráfico saliente (25-50 GB sobre los 5 GB incluidos × 0,15 $ ≈ 3-7 $) + Sentry/Better Stack 0 $ ≈ **50-80 $/mes** |
| Riesgos | El particionado de una tabla viva exige migrar `samples` (crear la nueva, copiar por lotes y renombrar) con la app en mantenimiento unos minutos. El rollup duplica la lógica de las medias: los tests de `api.test.js` tienen que cubrir que crudas y rollup dan lo mismo |

### Fase 2 · Escalado horizontal (≈ 1 mes)

**Objetivo:** **miles de equipos y 100-200 eventos simultáneos** (≈ 2-3 k coches), con N instancias y despliegues sin cortar
la carrera.

Diseño (lo que de verdad cambia):

```
Clientes ──WS──▶ LB Render (sin sticky; no hace falta: solo transporte websocket, index.js:38)
                 ├─ nodo A ─┐
                 ├─ nodo B ─┼─ @socket.io/redis-adapter (sharded pub/sub) ─▶ Valkey (Render Key Value)
                 └─ nodo C ─┘                 estado en vivo: hashes con TTL
                        └──── INSERT por lotes ───▶ Neon (pooler PgBouncer)
```

Pasos:
1. **Workspace Render Pro** (25 $/mes fijo, miembros ilimitados, **autoescalado**) y **2-4 instancias Standard**, con
   autoescalado por CPU. Quitar `numInstances: 1`.
2. **Render Key Value (Valkey 8)**, plan Standard (≈ 32 $/mes), en la misma región. Es suficiente para pub/sub y estado. **No
   usar Upstash con pago por comando**: el adapter publica cada `emit` a sala, y 4 msg/s × 2.000 coches ≈ 20.000 M comandos al
   mes, que a 0,2 $/100 k serían miles de dólares.
3. **Adapter**: `@socket.io/redis-adapter` en modo `createShardedAdapter` (sharded pub/sub de Redis 7/Valkey). Cada nodo solo
   recibe los mensajes de las salas donde tiene sockets, en vez de todo el tráfico.
4. **Estado en vivo a Valkey**, sin cambiar la semántica:
   - `team:<id>:live` como hash con `driver`, `pit` y `lastEvent`. Escritura en cada cambio (raro) y lectura al conectar.
   - **Presencia**: `team:<id>:online` como hash `userId → contador`, con heartbeat y TTL por nodo (`HINCRBY` al conectar y al
     desconectar, y limpieza al arrancar un nodo por su `nodeId`).
   - **Banderas**: ya están en Postgres (Fase 0). Valkey solo como caché.
   - **Cronómetro de vuelta**: **se queda en el nodo que tiene el socket del piloto**. Solo el piloto al volante produce
     telemetría, y un relevo ya reinicia la vuelta (`live.js:58`), así que no hay dos productores. Si ese piloto reconecta y cae en
     otro nodo, el cronómetro se reconstruye desde un snapshot (`startedAt`, `splits` y último punto) que se guarda en Valkey **en
     cada cruce de meta o de tramo y como mucho una vez por segundo**. El peor caso es perder la vuelta en curso, y eso ya pasa
     hoy con un reinicio.
   - **Caché de `team`** (`loadTeam`): por nodo, con invalidación por pub/sub (`teamChanged` publica `team:<id>:changed`).
5. **`kick()`**: cada socket se une a `user:<id>` al conectar, y `kick` pasa a ser
   `io.in('user:' + id).disconnectSockets(true)`. Funciona en todo el clúster y en O(1). Quitar el recorrido de `states`
   (`live.js:89-92`) y publicar el "suelta el volante" por el adapter.
6. **Banderas a toda la sala**: los equipos que participan se unen también a `event-cars:<id>`, y `setFlag` emite una sola vez
   (`live.js:32`).
7. **Postgres**: el **pooler** de Neon (`-pooler` en el host) con un pool de 10 por nodo. Las escrituras siguen siendo un lote por
   nodo y por segundo: a 3.000 coches son ≈ 3.000 filas/s repartidas en 3-4 sentencias/s, cómodo para 1-2 CU. **No hace falta
   ninguna cola (Kafka o similar)**. Solo se añade una cola (Valkey Streams o NATS) si hay que desacoplar consumidores (rollups,
   exportaciones, IA) o si se pasan ~30-50 k filas/s.
8. **Despliegues sin cortar la carrera**: al recibir `SIGTERM`, vaciar el buffer de muestras, guardar los snapshots de vuelta y
   cerrar los sockets con un motivo que el cliente reintente al momento (ya reconecta en 300 ms, `store.js:58`).
9. **Rate limiting compartido** en Valkey (`INCR` + `EXPIRE`) para el login, la API y los eventos de socket por usuario.
10. **Multi-tenancy, primer nivel**: tabla `organizations` con `org_id` en `events` y en los equipos inscritos, cuotas por
    organización (coches simultáneos y eventos activos) y roles por organización en vez de un `organizer` global. El admin de
    la plataforma queda aparte.
11. **Pruebas de carga** con Artillery desde 2-3 máquinas: 3.000 coches, un nodo matado a mitad (`kill -9`) y medición de la
    reconexión y de las vueltas perdidas.

| | |
|---|---|
| Dificultad | Alta |
| Esfuerzo | 15-25 días |
| Coste | Pro workspace 25 $ + 3 × Standard 75 $ (hasta 150 $ con autoescalado) + Key Value Standard ≈ 32 $ + Neon Launch/Scale ≈ 60-150 $ + tráfico saliente (≈ 200-600 GB × 0,15 $ ≈ 30-90 $; el Pro incluye 25 GB) + Sentry Team 26 $ ≈ **250-450 $/mes** |
| Riesgos | Es la fase con más bugs sutiles: presencia fantasma cuando un nodo muere (por eso el TTL), carreras en `driver` (usar `SET … NX` o un script Lua para tomar el volante) y dobles emisiones durante un deploy. Valkey pasa a ser un punto único de fallo: con caída de Valkey, cada nodo debe degradar a modo local (sus salas siguen funcionando, aunque se pierda el fan-out entre nodos). **El tráfico saliente de Render (0,15 $/GB) es el coste que más crece** |

### Fase 3 · Escala global (≈ 1,5-2,5 meses)

**Objetivo:** cientos de eventos simultáneos (≈ 5-10 k coches), organizadores comerciales aislados entre sí, eventos fuera de
Europa con baja latencia y coste por coche-hora predecible.

Decisiones:
1. **Mover el tiempo real a Fly.io con afinidad por evento.** Un evento sucede en un circuito: todos sus coches, su BOX y su
   organizador están en la misma región y casi siempre en el mismo nodo. Con `fly-replay` (que funciona en el upgrade de
   WebSocket), el nodo que recibe la conexión calcula `hash(eventId o teamId) → máquina` y la reenvía allí. Resultado: **el
   tráfico de telemetría no cruza Valkey**. El adapter queda solo para lo transversal (kicks, admin y equipos que cambian de
   evento).
   - Por qué Fly y no seguir en Render: **tráfico saliente a 0,02 $/GB frente a 0,15 $/GB**. Con ≈ 4.500 coches × 8 h × 8 días al
     mes × ≈ 10 MB/h (ya sin `limits`) ≈ 2,9 TB al mes: **≈ 58 $ en Fly frente a ≈ 430 $ en Render**. Además Fly tiene regiones
     en América y Asia y deja enrutar a una máquina concreta, que Render no permite.
   - El mismo código y la misma imagen. Fly Machines `performance-1x/2x` en `fra`, `mad` (si existe) y `iad`, según los clientes.
2. **Base de datos**: **Neon Scale** para la parte transaccional (usuarios, equipos, eventos, vueltas). Para `samples`, seguir en
   Postgres particionado con rollups. A 4.500 coches son ≈ 1.000 M filas al mes y ≈ 165 GB: 90 días de crudas ≈ 500 GB ≈ 175 $/mes
   de almacenamiento en Neon. **Salir a TimescaleDB (Tiger Cloud, con compresión de 10-20×) o a ClickHouse solo si** se quieren
   conservar las crudas más de 90 días o hacer análisis pesados (comparar trazadas, telemetría por curva). Neon solo ofrece la
   edición Apache de TimescaleDB, **sin compresión**, así que ahí no compensa.
   - Réplica de lectura de Neon para estadísticas y paneles, separada de las escrituras.
   - Región de datos: los clientes de la UE siempre en la UE (RGPD). Los de EE. UU. pueden tener su propio proyecto de Neon por
     región y escribir allí.
3. **Telemetría en binario**: `socket.io-msgpack-parser` en servidor y cliente (requiere una APK o PWA nueva en todos los
   móviles). Un 30-50 % menos de bytes. Delta-encoding solo si hace falta.
4. **Aislamiento por organizador**:
   - Cuotas duras en el handshake (coches activos por organización).
   - Eventos grandes (> 100 coches) en una máquina dedicada (el enrutado por evento lo da casi gratis).
   - Row Level Security en Postgres por `org_id` como segunda barrera frente a bugs de autorización. Exportación y borrado por
     organización.
5. **Observabilidad de producto**: trazas de OpenTelemetry hacia Grafana Cloud o Sentry, un SLO de "latencia coche → BOX
   p99 < 150 ms" y otro de "vueltas perdidas < 0,1 %", y una página de estado pública.
6. **Operación**: runbook de evento (checklist previa, prueba de carga de humo, guardia), backups probados cada mes,
   recuperación ante desastre (RPO 1 h, RTO 30 min) y un entorno de staging con datos sintéticos.

| | |
|---|---|
| Dificultad | Alta |
| Esfuerzo | 30-50 días (más 5-10 por región adicional) |
| Coste | Fly: 6-12 máquinas performance (≈ 250-600 $) + tráfico saliente ≈ 60-120 $ + Valkey gestionado ≈ 50-150 $ + Neon Scale ≈ 300-700 $ (cómputo siempre encendido + 500 GB) + Sentry/Grafana ≈ 80-150 $ ≈ **900-2.000 $/mes** |
| Riesgos | Migrar de host con APKs en la calle: **se resuelve con el dominio propio de la Fase 0**. El enrutado por evento complica los equipos que cambian de evento en caliente (solución: forzar la reconexión, como hoy con `kick`). Fly tiene menos servicios gestionados: el equipo asume más operación |

---

## 4. iOS, App Store y Play Store (transversal)

| Tema | Estado | Qué hacer | Esfuerzo |
|---|---|---|---|
| **iOS** | No soportado: hay proyecto `android/` y no `ios/` | `npx cap add ios`. `@capacitor-community/bluetooth-le` funciona en iOS. **Bluetooth clásico (SPP) no existe en iOS** sin MFi, así que solo valen ELM327 **BLE o WiFi**: hay que decirlo en la tienda y en Ajustes. Reescribir en Swift los plugins `Thermal` (iOS no da la temperatura de la batería, solo `thermalState`), `Background` (modo de fondo `location` con `CLLocationManager`, `allowsBackgroundLocationUpdates`) y `Updater` (**se quita**: en iOS no se puede autoinstalar) | 8-12 días + Mac + 99 $/año |
| **App Store** | — | Apple rechaza las apps que solo son una web remota (guía 4.2, funcionalidad mínima) y vigila el código descargado (2.5.2). **Empaquetar `dist/` dentro de la app** (quitar `server.url`, apuntar API y socket al dominio propio) y justificar la ubicación en segundo plano y Bluetooth en `Info.plist`. Privacy Nutrition Labels: ubicación precisa vinculada al usuario | 3-5 días + revisión |
| **Play Store** | APK de debug y autoactualización (`REQUEST_INSTALL_PACKAGES`, plugin `Updater`) | AAB de release (`bundleRelease`) con Play App Signing. **La política de Google Play prohíbe que una app se actualice fuera de Play**: hacer un *flavor* `play` sin `Updater` ni ese permiso, y mantener el APK de GitHub para quien instale a mano. Declarar el servicio en primer plano de tipo `location` (ya está en el manifiesto) con vídeo justificativo, rellenar Data Safety y la política de privacidad pública, y subir `targetSdk` cada año (hoy 36) | 3-5 días + 25 $ una vez |
| Compilar en CI | Solo Android | iOS con un runner `macos-latest` y fastlane `match` para los certificados. Android con un job aparte para el AAB | 2-3 días |

---

## 5. Seguridad y RGPD (transversal; empieza en la Fase 0)

La app trata **ubicación precisa de personas físicas identificadas** (pilotos, a veces menores en karting), asociada a nombre y
email y guardada a 1 Hz. No es una categoría especial del art. 9, pero permite seguir a una persona de forma sistemática, y eso
pide rigor.

| Obligación | Acción concreta | Fase |
|---|---|---|
| Base jurídica (art. 6) | Ejecución del contrato (el servicio *es* la telemetría) o consentimiento explícito al activar el GPS. Mostrarlo en el registro y en "Tomar el volante" | 0 |
| Información (arts. 13-14) | Política de privacidad: qué se guarda (`samples`), durante cuánto (90 días crudas, después agregados), encargados (Render, Neon, Sentry) y transferencias | 0 |
| **Minimización y retención** (art. 5.1.c-e) | Retención automática (Fase 1). Solo se guarda la posición con telemetría activa. Se puede valorar guardar `lat/lng` con 5 decimales (≈ 1 m) | 1 |
| Derechos (arts. 15-20) | "Descargar mis datos" en Perfil (JSON/CSV de vueltas y muestras). Hoy al **eliminar la cuenta**, `samples.driver_id` pasa a null (`db.js:87-89`), **pero lat/lng y ts se quedan**: técnicamente ya no se asocian a la persona, pero el equipo sigue pudiendo atribuirlas. Decidir y documentarlo, o borrar las muestras del piloto al darse de baja | 1 |
| Encargados (art. 28) | Aceptar los DPA de Render, Neon y Sentry. Render es una empresa de EE. UU.: cláusulas contractuales tipo / Data Privacy Framework. Elegir región UE en todo (ya está: Frankfurt) | 0 |
| Registro de actividades (art. 30) y **EIPD** (art. 35) | El seguimiento sistemático de la localización suele exigir una EIPD según la lista de la AEPD. Redactarla una vez, en 1-2 días | 1 |
| Seguridad (art. 32) | TLS (ya está), rate limiting (Fase 0), cabeceras (Fase 1), registro de auditoría de los accesos de admin y organizador a datos de pilotos, cifrado en reposo (Neon ya lo hace), backups cifrados | 0-1 |
| Organizador como responsable o corresponsable | Cuando haya organizaciones (Fase 2), contrato plataforma ↔ organizador: quién es responsable de los datos del evento | 2 |

Fuera del RGPD: en el login, **mensajes genéricos** (ya lo hace: "Email o contraseña incorrectos") y el mismo tiempo de respuesta
exista o no el usuario: hoy, si el email no existe, no se ejecuta scrypt (`api.js:164`), y eso deja **enumerar usuarios por tiempo
de respuesta**. Se arregla con un scrypt de señuelo.

---

## 6. Recomendación de stack por etapa (decidida)

| Etapa | Escala | Host app | Tiempo real | BD | Caché/estado | Observabilidad | Coste |
|---|---|---|---|---|---|---|---|
| **Fase 0** | 1-10 equipos, eventos de < 50 coches | **Render Starter** (Hobby), dominio propio | 1 proceso, Socket.IO | **Neon Free** + `pg_dump` a R2 | Postgres para banderas y mensajes | Sentry Developer | ≈ 8 $ |
| **Fase 1** | ≤ 500 coches simultáneos | **Render Standard** | 1 proceso | **Neon Launch**, `samples` particionada + rollups | — | Sentry, Better Stack o Grafana Cloud free, `/metrics` | ≈ 50-80 $ |
| **Fase 2** | 2-3 k coches, 100-200 eventos | **Render Pro workspace + N × Standard** con autoescalado | Socket.IO + **sharded redis-adapter** | Neon Launch/Scale + pooler | **Render Key Value (Valkey)** | Sentry Team + Grafana | ≈ 250-450 $ |
| **Fase 3** | 5-10 k coches, multirregión | **Fly.io** (afinidad por evento con `fly-replay`) | Socket.IO + msgpack; adapter solo transversal | **Neon Scale** + réplica de lectura; Tiger Cloud solo si se conservan crudas > 90 días | Valkey gestionado | OTel + SLOs | ≈ 900-2.000 $ |

**Lo que no recomiendo:**
- Kubernetes.
- Reescribir en Go o Elixir antes de la Fase 3: un proceso Node ya mueve ≈ 1.000 coches.
- Kafka.
- Upstash con pago por comando para pub/sub.
- Hetzner autogestionado: tras la subida del 15/06/2026, un CCX13 dedicado cuesta 42,99 €. Solo compensaría con alguien de
  operación en el equipo.
- Supabase Realtime o servicios de pub/sub gestionados (Ably, Pusher): el cronómetro y las reglas de boxes tienen que ir en el
  servidor, junto al socket.

**Orden si solo hay tiempo para cinco cosas:** (1) Render Starter + dominio propio, (2) rate limiting del login,
(3) `INSERT` de muestras por lotes + retención, (4) persistir banderas y mensajes, (5) CI con tests antes del deploy.

---

## Fuentes (consultadas el 2026-10-05)

- Render, instancias y CPU/RAM: https://render.com/docs/compute-plans.md
- Render, límites del plan Free (sueño a los 15 min, cuenta el tráfico WebSocket, reinicios, suspensión por tráfico): https://render.com/docs/free
- Render, precios por instancia (Starter 7 $, Standard 25 $, Pro 85 $…): https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses · https://jwatte.com/blog/render-com-platform-review/
- Render, planes de workspace del 01/08/2026 (Hobby 0 $ con 5 GB, Pro 25 $ fijo con 25 GB, excedente a 0,15 $/GB): https://jwatte.com/blog/render-com-platform-review.md · https://livemy.app/blog/render-pricing · https://render.com/docs/new-workspace-plans
- Render Key Value con Valkey 8 y precios (Starter 10 $, Standard 32 $, Pro 135 $; rebaja desde el 01/10/2026): https://render.com/changelog/new-render-key-value-instances-run-valkey-8 · https://render.com/docs/valkey-faq · https://render.com/blog/lower-prices-for-key-value-services
- Neon, precios (Free: 100 CU-h, 1 GB, PITR de 6 h, 5 GB de salida; Launch: 0,106 $/CU-h; Scale: 0,222 $/CU-h; 0,35 $/GB-mes): https://neon.com/pricing
- Neon y TimescaleDB (solo la edición Apache-2, sin compresión): https://neon.com/docs/extensions/timescaledb
- Fly.io, precios (salida en Europa a 0,02 $/GB, Managed Postgres desde 38 $): https://docs.fly.io/about/pricing
- Fly.io, `fly-replay` y WebSocket: https://fly.io/docs/reference/fly-replay · https://fly.io/docs/networking/dynamic-request-routing/ · https://community.fly.io/t/request-force-websockets-requests-to-a-specific-machine-from-client/21713
- Hetzner, subida de precios del 15/06/2026 (CX23 5,49 €, CCX13 42,99 €): https://privatedevops.com/news/hetzner-june-2026-cloud-price-increase-what-to-do · https://findstack.com/resources/hetzner-price-increase-2026
- Upstash Redis (0,2 $ por 100 k comandos): https://upstash.com/pricing/redis
- Sentry (Developer gratis con 5 k errores; Team 26 $/mes): https://sentry.io/pricing/
- Socket.IO Redis adapter (sharded): https://socket.io/docs/v4/redis-adapter/
- Artillery con Socket.IO: https://www.artillery.io/docs/reference/engines/socketio
- RGPD (Reglamento 2016/679): https://eur-lex.europa.eu/eli/reg/2016/679/oj · AEPD, lista de tratamientos que requieren EIPD: https://www.aepd.es/documento/listas-dpia-es-35-4.pdf
- Google Play, política de abuso de dispositivos y redes (sin autoactualizaciones fuera de Play): https://support.google.com/googleplay/android-developer/answer/9888379 · Apple App Review Guidelines 2.5.2 y 4.2: https://developer.apple.com/app-store/review/guidelines/

---

# Parte 5 · UX de Admin y Organizador + Pagos con Stripe


> Fecha: 2026-10-05. Basado en el código de `main` (`1d319f8`): `src/App.jsx`, `src/lib/mode.js`, `src/views/Admin.jsx`, `src/views/Events.jsx`, `src/views/ui.jsx`, `src/views/RaceFlag.jsx`, `src/views/Racing.jsx`, `src/views/TrackMap.jsx`, `src/index.css`, `server/api.js`, `server/live.js`, `server/db.js`, `server/index.js`. No se ha tocado ni el repo ni la base de datos de producción.
> Las referencias `archivo:línea` apuntan a ese commit.

---

## Parte A · UX de las vistas Admin y Organizador

### A.1 Diagnóstico

#### Arquitectura de información

| # | Hallazgo | Dónde | Impacto |
|---|---|---|---|
| IA-1 | El modo Organizador tiene **una sola vista**, «Mis eventos». Todo el ciclo de vida del evento (datos, código, sesión, banderas, clasificación, mapa, pista e inscritos) vive en **una única página con scroll** | `App.jsx:33`, `Events.jsx:128-229` | Lo que se usa con prisa el día de carrera (banderas) queda en el mismo lienzo que lo que se configura una vez (nombre, fecha) o que es destructivo (eliminar) |
| IA-2 | La URL es solo `#vista`: no existe `#eventos/12` ni `#eventos/12/control`. Al recargar o reconectar, el evento seleccionado vuelve a ser `l[0]` | `App.jsx:39`, `Events.jsx:20` | El día de carrera, una recarga del portátil te puede abrir **otro evento**. Tampoco se puede compartir un enlace a un evento ni abrirlo en una segunda pestaña o pantalla |
| IA-3 | Orden de las tarjetas del detalle: Evento (configuración) → Dirección de carrera → Clasificación → Mapa (520 px) → Inscritos | `Events.jsx:131-226` | Para pasar de la clasificación a echar a un equipo hay que bajar por debajo de un mapa de 520 px. En un portátil de 768 px de alto, la bandera roja queda **debajo del pliegue** en cuanto bajas a mirar la clasificación |
| IA-4 | El admin tiene «Cuentas» (con dos pestañas: Cuentas y Equipos) y «Eventos», que reutiliza la vista del organizador con `admin` | `App.jsx:24,34-37`, `Admin.jsx:22` | Los equipos están dentro de «Cuentas». No hay pantalla de inicio con métricas, ni auditoría, ni facturación |
| IA-5 | El modo solo se cambia en Perfil. La pastilla de la cabecera lleva a Perfil, pero no cambia de modo | `App.jsx:119-122`, `Profile.jsx:30-31` | Un admin que organiza y además corre necesita tres clics y cambiar de página para pasar de Admin a Organizador |
| IA-6 | El evento no tiene **estado de ciclo de vida**. Solo tiene `closed` (inscripciones), `private` y `session` | `db.js:94-113`, `api.js:36` | Ni la interfaz ni el servidor distinguen entre un borrador, un evento con inscripciones abiertas, uno que se corre hoy y uno ya terminado. La lista solo enseña las pastillas «Privado» y «Cerrado» (`Events.jsx:49`) |

#### Flujos (crear evento → pista → inscripciones → día de carrera → sesiones → banderas → resultados)

1. **Crear evento** (`Events.jsx:56-63`, `api.js:399-404`). El formulario de la columna izquierda pide nombre, fecha y lugar, y el evento nace con las inscripciones **abiertas** y como **público** (los valores por defecto de `db.js:102,111`). Así, un evento a medio configurar, todavía **sin pista**, ya aparece en `/api/events/public` (`api.js:390-398`) y los equipos pueden inscribirse. No existe el estado de borrador.
2. **Configurar la pista** (`Events.jsx:210-216`, `TrackMap.jsx:202-263`). Se dibuja desde cero en el mapa: trazado punto a punto, meta y tramos. No se puede **importar** una pista ya guardada (las de `tracks` son por equipo, `db.js:54-60`) ni copiar la de un evento anterior del mismo circuito. La barra del mapa solo dice «La misma pista para todos…» (`Events.jsx:214`). El evento no te avisa si falta la meta (y sin meta no hay vueltas).
3. **Abrir inscripciones / compartir** (`Events.jsx:145-153`, `156-160`). «Copiar enlace» no confirma que se ha copiado (`:150`). **«Renovar» invalida el código al instante y sin confirmación** (`:152`), con lo que rompe los enlaces que ya se hubieran compartido por WhatsApp. No hay cupo de equipos ni fecha de cierre de inscripción.
4. **Día de carrera**. No hay nada que diga «hoy». No hay checklist previo, ni vista de cuántos equipos están **participando** frente a solo inscritos (está en cada fila: `Events.jsx:196`, `282`), ni una forma de pedirles que participen (es el pendiente nº 8 de `CONTEXTO.md`). Riesgos de infraestructura que la interfaz ignora: Render free se duerme a los 15 min, las banderas viven en memoria (`live.js:26`) y **cada push a `main` despliega y reinicia el servidor**, lo que borra la bandera activa en plena carrera.
5. **Sesiones** (`Events.jsx:154-155`). Es un `Segmented` de un toque y **sin confirmación**: pasar de Carrera a Entrenamiento por error en mitad de la carrera clasifica las vueltas siguientes en la sesión equivocada (`laps.kind`), y eso no se puede deshacer desde la interfaz. Tampoco hay reloj de sesión, ni inicio y fin, ni número de vueltas o duración.
6. **Banderas** (`Events.jsx:233-264`, `live.js:119-123`).
   - Lo bueno: el doble toque con 3 s de rearme (`:237`), los colores de bandera (`store.js:36-42`) y el contador «visto por n/m» (`:251`).
   - **Falta el acuse del servidor**: `socket.emit('event:flag', …)` va sin callback (`Events.jsx:167`). Si el portátil está sin conexión, Socket.io **guarda el envío en el búfer y lo manda al reconectar**, a veces minutos después (el comportamiento buscado para los mensajes, `store.js:51`, es peligroso para una bandera roja). El organizador no ve «enviada» ni «no enviada».
   - El denominador de «visto por n/m» es `ev.teams.length` (`:167`), es decir, todos los inscritos, cuando la bandera solo llega a los que **participan** (`live.js:32`). Con 10 inscritos y 6 participando, nunca pasará de 6/10.
   - No hay historial de banderas: se pierde al reiniciar y no queda registro para reclamaciones. No hay atajos de teclado. La bandera azul y la de cuadros (fin de sesión) no existen.
7. **Resultados**. No existen como tales: la clasificación en vivo (`api.js:463-473`) es lo único que hay. No se puede congelar el resultado final, ni exportarlo a CSV o PDF, ni publicar un enlace para los equipos. Ordenar por «Más vueltas» hace de clasificación de resistencia, pero no se puede guardar.

#### Densidad y jerarquía

- La tarjeta «Evento» mezcla 4 niveles de importancia con el mismo peso visual (`Events.jsx:131-165`): campos editables, el código en 26 px, la sesión, tres botones fantasma y un `ConfirmButton` de **eliminar**, con dos párrafos de ayuda. La acción destructiva queda pegada a «Cerrar inscripciones» (`:157-162`).
- La clasificación (`:175`) tiene `min-w-[720px]` y 8 columnas. En tableta vertical o móvil obliga a hacer scroll horizontal precisamente en la tabla que se mira con prisa.
- El mapa tiene una altura fija de `h-[520px]` (`:211`). En un portátil de 13" deja la clasificación y las banderas fuera de la vista.
- Admin (`Admin.jsx:50-93`): tabla de 6 columnas con un `select` de rol en línea. Es densa y está bien para pocos usuarios, pero **carga todos los usuarios** (`api.js:475`) y filtra en el cliente (`Admin.jsx:28`). Sin paginar, no escala.

#### Estados vacíos, errores y feedback

| Caso | Estado actual | Problema |
|---|---|---|
| Carga | Texto «Cargando…» (`Admin.jsx:37,88`, `Events.jsx:114`) | Correcto y sobrio, aunque se puede pasar a un skeleton estático (lo recomienda `investigacion-ux-ui.md` §11) |
| Lista de eventos vacía | «Aún no has creado ningún evento.» (`Events.jsx:42`) | No hay llamada a la acción: el formulario de creación está debajo y, en móvil, fuera de la vista |
| Errores | Un único `ErrorText` arriba de la página o del detalle (`Events.jsx:38,130`) | El error de «Añadir piloto» (`TeamRow`, `:271`) aparece **lejos del formulario** (`:306-313`), muchas veces fuera de la vista |
| Guardado de campos | `BlurInput` guarda al perder el foco (`Events.jsx:319-324`) | No indica «Guardado» ni «Guardando…». Si falla, el error sale arriba y el campo **se queda con el valor no guardado** |
| Cambio de rol | `select` que guarda al cambiar (`Admin.jsx:60`) | **Ascender a Admin con un solo gesto y sin confirmar**. Sin deshacer ni registro |
| Restablecer contraseña | Aviso con la contraseña temporal y botón Copiar (`Admin.jsx:40-47`) | Está bien resuelto. «Copiar» no confirma la copia |
| Bandera enviada | La pastilla cambia cuando vuelve `event:flag` | Si no vuelve, no avisa (ver el punto 6 de los flujos) |

#### Accesibilidad

- Las filas de la clasificación son clicables con `onClick` en el `<tr>` (`Events.jsx:186`): **no se pueden usar con teclado** (no tienen `tabIndex`, `role` ni Enter).
- El estado «ha visto la bandera» se transmite con un icono y su color, más un `title` (`Events.jsx:197-199`). En pantallas táctiles el `title` no existe y los lectores de pantalla lo leen mal. Hace falta texto oculto (`sr-only`).
- `Segmented` usa `role="radio"` sin navegación con flechas (`ui.jsx:51-65`). Cumple lo justo, pero un `radiogroup` sin flechas no es lo que espera quien usa teclado.
- Tablas sin `<caption>` ni `scope` (`Admin.jsx:51`, `Events.jsx:176`).
- Cabecera: debajo de `lg` las pestañas solo muestran iconos y el nombre accesible sale del `title` (`App.jsx:127-130`). Mejor un `aria-label` explícito.
- Lo positivo: `:focus-visible` global (`index.css:58`), contrastes calculados en los tokens, `prefers-reduced-motion` (`index.css:68`) y confirmaciones en línea en lugar de `confirm()`.

#### Dispositivos

| Dispositivo | Situación real en el muro | Hoy |
|---|---|---|
| Portátil 13–15" (1280–1440 × 720–800) | El dispositivo principal de dirección de carrera | La rejilla `280px + 1fr` (`Events.jsx:39`) desperdicia la columna izquierda durante la carrera (la lista de eventos y el formulario de crear no sirven ese día). La bandera y la clasificación no se ven a la vez |
| Tableta apaisada (1024–1180) | Muy habitual en el pit wall y al sol | Cabe, pero la tabla hace scroll horizontal y las banderas quedan a media página |
| Móvil (360–430) | El organizador en la parrilla, andando | Hay que pasar por lista, formulario de crear, detalle, banderas… La bandera está a 2–3 pantallas de scroll |
| Pantalla externa o TV | Monitor de tiempos para el público o los equipos | No existe una vista de solo lectura |

#### Uso con prisa el día de carrera (resumen de riesgos)

1. La bandera queda fuera de la vista al hacer scroll (IA-3).
2. Una bandera puede enviarse tarde sin que el organizador lo sepa (búfer de Socket.io, `Events.jsx:167`).
3. La sesión cambia de un toque y sin confirmar (`Events.jsx:154`).
4. «Eliminar evento» está en la misma tarjeta que los controles diarios (`Events.jsx:161`).
5. Una recarga puede abrir otro evento (IA-2).
6. Un despliegue o un servidor dormido borra la bandera activa y retrasa la primera conexión, y la interfaz no lo dice.
7. La conexión solo se indica con un punto y un texto pequeños en la cabecera (`App.jsx:154-163`). En dirección de carrera tiene que ser imposible no verla.

---

### A.2 Propuesta de rediseño

#### Principios

1. **Separar «preparar» de «correr».** Configurar es tranquilo (formulario y checklist). Dirigir la carrera es una consola a pantalla completa, sin nada destructivo a la vista.
2. **La URL es el estado**: `#eventos`, `#eventos/12`, `#eventos/12/pista`, `#control/12`. Recargar devuelve al mismo sitio.
3. **Cada acción crítica tiene acuse**: enviando → confirmada por el servidor → vista por n/m. Si no llega en 2 s: «NO ENVIADA · reintentar».
4. **Ciclo de vida derivado y visible**: Borrador → Inscripción → Hoy → Terminado. Se deriva de los datos y no hace falta guardarlo aparte.
5. Mantener los tokens y patrones ya decididos (`index.css`, `investigacion-ux-ui.md`): color con significado, `.num`, confirmación en línea, mantener pulsado para lo grave.

#### Navegación nueva

```
Modo ORGANIZADOR                     Modo ADMIN
───────────────────────────────      ─────────────────────────────────────
Eventos        #eventos              Resumen      #admin            (métricas)
  └ Evento     #eventos/12[/tab]     Cuentas      #cuentas[/id]     (tabla + panel)
Race Control   #control/12           Equipos      #equipos[/id]
  (pestaña solo si hay evento hoy)   Eventos      #eventos-admin[/id]
Plan           #plan                 Facturación  #facturacion
  (facturación, Parte B)             Auditoría    #auditoria
```

- **Selector de modo en la cabecera**: la pastilla `MODES[mode]` (`App.jsx:120`) pasa a ser un menú desplegable con los modos de `modesOf(role)`, como el selector de cuenta de Stripe Dashboard o el de workspace de Linear. Perfil sigue guardando la preferencia.
- `App.jsx` solo necesita partir el hash: `const [view, ...rest] = location.hash.slice(1).split('/')` y pasar `rest` a la página. `valid()` sigue comprobando solo `view`.

#### Estados del evento (derivados, sin columna nueva)

| Estado | Regla (en el servidor, en `eventSummary`) | Pastilla | Acción siguiente que se sugiere |
|---|---|---|---|
| Borrador | `draft = true` (columna nueva, por defecto `true` en los eventos nuevos) | `muted` «Borrador» | «Completa la checklist y publica» |
| Inscripción | `!draft && starts_on > hoy` | `accent` «Inscripción abierta/cerrada» | «Comparte el código» |
| Hoy | `starts_on = hoy` | `ok` + punto pulsante «Hoy» | Botón grande **«Abrir Race Control»** |
| Terminado | `starts_on < hoy` | `muted` «Terminado» | «Ver resultados / exportar» |

> `draft` es la única columna nueva: evita que un evento sin pista salga en la lista pública (flujo 1). Los eventos existentes quedan `draft = false`.

#### Pantalla 1 · Lista de eventos (organizador)

Patrón: la lista de *issues* de Linear y la de pagos de Stripe. Filas densas, estado a la izquierda, siguiente acción a la derecha y la creación con un solo botón primario (no un formulario fijo en pantalla).

```
┌ BOX BOX  [ORGANIZADOR ▾]   Eventos   Plan                           ● Conectado  14:02  ☾  (F) ┐
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ EVENTOS                                                        [ Buscar…  ]  [ + Nuevo evento ] │
│ [Próximos · 3]  [Hoy · 1]  [Borradores · 1]  [Terminados · 12]                                   │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ● HOY        24 H de Jarama          5 oct · Jarama       9 equipos · 6 participan  [RACE CONTROL]│
│ ○ INSCRIPCIÓN Copa Invierno R1        19 oct · Motorland   4 equipos   código K7Q2  [Compartir]  │
│ ◌ BORRADOR    Resistencia Albacete    —      · —          checklist 2/5            [Continuar]   │
│   TERMINADO   6 H Cheste              21 sep · Cheste      11 equipos               [Resultados] │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
 Vacío: «Todavía no tienes eventos. [+ Crear el primero]  ·  Tardas 3 minutos: nombre, pista y código.»
```

#### Pantalla 2 · Asistente de creación (4 pasos) con checklist «evento listo»

Patrones: el asistente de Stripe Checkout/Payment Links (vista previa a la derecha) y la *setup guide* de Shopify (checklist persistente con progreso).

```
┌ NUEVO EVENTO ──────────────────────────────────────────────────────────────────────────────────┐
│  ① Datos ──── ② Pista ──── ③ Inscripción ──── ④ Revisar y publicar                              │
├───────────────────────────────────────────────┬────────────────────────────────────────────────┤
│ ② PISTA                                       │ ASÍ LO VERÁN LOS EQUIPOS                       │
│ ( ) Usar una pista guardada   [Jarama GP  ▾]  │ ┌────────────────────────────────────────────┐ │
│ ( ) Copiar de un evento       [6 H Cheste ▾]  │ │ 24 H de Jarama · 5 oct · Jarama            │ │
│ (•) Dibujarla ahora                           │ │ Pista: Jarama GP · 3 tramos                │ │
│ ┌───────────────────────────────────────────┐ │ │ [ Inscribir a mi equipo ]                  │ │
│ │              (mapa TrackMap)              │ │ └────────────────────────────────────────────┘ │
│ │  [Trazado ✓] [Meta ✓] [Tramos · 3]        │ │                                                │
│ └───────────────────────────────────────────┘ │ CHECKLIST  ▓▓▓▓▓▓░░░░ 3/5                      │
│ ⚠ Sin meta no se cronometran vueltas.         │ ✓ Nombre y fecha                               │
│                                               │ ✓ Trazado del circuito                         │
│        [ ← Atrás ]   [ Guardar borrador ]     │ ✓ Línea de meta                                │
│                      [ Siguiente → ]          │ ○ Tramos (opcional)                            │
│                                               │ ○ Inscripción: pública/privada, cupo, cierre   │
└───────────────────────────────────────────────┴────────────────────────────────────────────────┘
```

**Checklist en dos fases** (siempre visible en `#eventos/12`, pestaña *Resumen*):

| Fase | Comprobación | Fuente | Bloquea |
|---|---|---|---|
| Publicar | Nombre y fecha | `events` | Sí |
| | Trazado (≥ 3 puntos) y meta | `events.track.path`, `.line` | Sí (meta); el trazado, aviso |
| | Tipo de inscripción (pública/privada) y cupo | `events.private`, `max_teams` (nueva, opcional) | No |
| Día de carrera | ≥ 1 equipo **participando** | `teams.racing` | Aviso |
| | Equipos inscritos que no participan: lista con «Recordar» (aviso a su BOX) | `teams.racing = false` | Aviso |
| | Equipos con señal en los últimos 5 min | `event:car` | Aviso |
| | Bandera de prueba enviada y vista por todos | `flag.seen` | Aviso |
| | Servidor despierto y sin despliegues: «Congela los despliegues hoy» (texto) | Comprobación manual | No |

#### Pantalla 3 · Espacio del evento (preparación)

Pestañas: **Resumen** (checklist, código y compartir) · **Pista** · **Inscritos** · **Resultados** · **Ajustes** (nombre, fecha, lugar, privado, renovar código, **zona de peligro** con Eliminar). Lo destructivo y lo raro pasa a *Ajustes*, como en las *Settings* de GitHub y Vercel, con la *Danger zone* al final.

```
┌ ← Eventos   24 H DE JARAMA   ● HOY · 5 oct · Jarama                     [ ▶ ABRIR RACE CONTROL ] ┐
│ Resumen   Pista   Inscritos · 9   Resultados   Ajustes                                          │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ INSCRITOS · 9            [Buscar equipo]   [Todos ▾ | Participan 6 | No participan 3]            │
│ ☐ #12  Los Cencerros      Participando   ● señal 2 s   3 pilotos            [⋯]                │
│ ☐ #7   Kart Team Sur      No participa   ○ sin señal   2 pilotos  [Recordar] [⋯]               │
│ ☐ #3   Box Box Junior     Participando   ● señal 1 s   4 pilotos            [⋯]                │
│ ─ Con 2 seleccionados:  [Recordar que participen]  [Echar del evento…]                          │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
 [⋯] abre un panel lateral: pilotos (sacar), añadir por email, código del equipo, historial de vueltas.
 Los errores salen dentro del panel, junto al campo que falla.
```

#### Pantalla 4 · Race Control (pantalla completa)

Referencias:
- **Sistemas de dirección de carrera de la FIA/F1** y **Apex Timing**, **TSL** y **MyLaps Orbits/Speedhive**: torre de tiempos a la izquierda, mensajes de dirección de carrera como **registro con hora**, banderas por sector y reloj de sesión siempre visible.
- **Paleta de comandos de Linear** y atajos de una tecla.
- La propia `investigacion-ux-ui.md` §4/§7: rejilla sin scroll de página y mantener pulsado para lo grave.

Ruta `#control/12`. La API Fullscreen y Wake Lock (que ya se usan en Piloto) se reutilizan aquí. No hay nada editable ni destructivo.

```
┌ RACE CONTROL · 24 H DE JARAMA ─ CARRERA ─ ⏱ 02:14:37 ─────────────── ● EN LÍNEA 38 ms  14:02:11 ✕┐
├───────────── banner de conexión (solo si cae): ■ SIN CONEXIÓN · las banderas NO se envían ───────┤
├──────────────────────────────┬───────────────────────────────────┬──────────────────────────────┤
│ TORRE           MEJOR  ÚLT.  │                                   │ BANDERA ACTIVA               │
│ 1 #12 Cencerros 1:42.3 1:43.0│                                   │ ┌──────────────────────────┐ │
│ 2 #3  BB Junior +0.812 1:44.1│          MAPA EN VIVO             │ │ ■ AMARILLA  desde 14:01:50│ │
│ 3 #21 Racing V  +1.204  BOX  │      (coches con estado)          │ │ VISTO 4/6 PARTICIPANTES   │ │
│ 4 #7  Kart Sur   —     ○ —   │                                   │ │ Faltan: #21 Racing V, #9  │ │
│ ▌ banda izq. = estado        │                                   │ └──────────────────────────┘ │
│   (ok/boxes/sin señal)       │                                   │ [G] VERDE   [Y] AMARILLA     │
│ ⚑ = no ha visto la bandera   │                                   │ [S] SAFETY  [R] ROJA ▮▮▮▯    │
│                              │                                   │ [F] CUADROS (fin de sesión)  │
│ Orden: [Mejor | Vueltas]     │                                   │ Aviso: [Aceite en curva 3 ][⏎]│
├──────────────────────────────┴───────────────────────────────────┼──────────────────────────────┤
│ REGISTRO  14:01:50 Amarilla ✓servidor · 14:01:52 #12 visto · 14:00:03 #21 entra en boxes ·    │
│           13:58:41 #3 vuelta 1:44.1 · 13:40:00 Sesión → Carrera (Ana) …               [Exportar] │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
 Sesión: [Entrenamiento | ▶ Carrera] → cambiar = mantener pulsado 1 s + texto «Las vueltas siguientes
 cuentan como Entrenamiento». Roja: mantener pulsado 600 ms (barra de progreso dentro del botón).
 Teclado: G/Y/S/F = armar (2.ª pulsación o Enter envía, Esc cancela); R = mantener pulsado.
```

- **Acuse**: `socket.timeout(2000).emit('event:flag', data, (err, res) => …)`. Si hay `err`, aparece «NO ENVIADA» en rojo con «Reintentar». Si el socket no está conectado, **no se envía** (sin búfer), los botones se desactivan y sale el banner de conexión.
- **Denominador correcto**: «visto por n / participantes» y la lista de los que faltan por nombre, que es lo que de verdad necesita el director («¿quién no la ha visto?»).
- **Persistencia**: cada bandera, cambio de sesión y «visto» se escribe en `event_log` (tabla nueva, Parte A.3). Al arrancar, el servidor recupera la bandera activa de ahí, con lo que deja de perderse en un despliegue.
- **Adaptación al tamaño**:
  - ≥ 1280 px: 3 columnas.
  - 900–1279 px (tableta apaisada): torre y banderas, con el mapa en una pestaña.
  - < 900 px (móvil): **solo banderas** (4 botones a pantalla completa, de ≥ 72 px como en Piloto) con la torre plegada debajo.
- **Vista pública de solo lectura**, `#tiempos/<código>`: torre y bandera, sin controles, para una TV del box o los equipos. Encaja con la línea de Apex Timing y Speedhive. Es opcional y va en una fase posterior.

#### Pantalla 5 · Resultados

Para congelar el resultado de una sesión se pulsa «Publicar resultado», que guarda una instantánea de la clasificación en `event_results` (jsonb). Desde ahí se puede exportar a CSV (con `Blob` y un `<a download>`, sin librerías), imprimir (CSS `@media print`, en lugar de generar un PDF) y compartir el enlace público. Una nota de reclamación queda en el registro.

#### Pantalla 6 · Admin · Resumen (métricas)

Referencias: la *Home* de Stripe Dashboard (KPIs con su variación), la búsqueda global ⌘K de Stripe y Linear, los filtros como «chips» de Stripe (`Estado: activo ×`) y el *Audit log* de GitHub o del Workspace de Google.

```
┌ BOX BOX [ADMIN ▾]  Resumen  Cuentas  Equipos  Eventos  Facturación  Auditoría     [⌘K Buscar…] ┐
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ USUARIOS 412 (+18 / 7 d) │ ORGANIZADORES 9 (3 de pago) │ EVENTOS HOY 1 · PRÓX. 30 d 4 │ MRR 87 € │
│ EN VIVO AHORA: 6 equipos conectados · 1 evento con bandera AMARILLA (24 H Jarama)            [→] │
├───────────────────────────────────────────────┬──────────────────────────────────────────────────┤
│ NECESITA ATENCIÓN                             │ ACTIVIDAD RECIENTE (auditoría)                   │
│ ⚠ 2 pagos fallidos (past_due)            [→]  │ 13:58 ana@… cambió el rol de luis@… a Organizador│
│ ⚠ 3 cuentas con cambio de contraseña ≥ 7 d    │ 13:40 Sesión → Carrera en 24 H Jarama (org.)     │
│ ⓘ 1 evento hoy con 3 equipos sin participar   │ 12:02 Reembolso de 49 € (pase) · admin           │
└───────────────────────────────────────────────┴──────────────────────────────────────────────────┘
```

#### Pantalla 7 · Admin · Cuentas (búsqueda, filtros, acciones masivas y panel de detalle)

```
┌ CUENTAS · 412      [Buscar nombre, email, equipo…]  [Rol: Todos ▾] [Plan ▾] [Alta: 30 d ▾] [CSV] ┐
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ☐ NOMBRE           EMAIL               EQUIPO        ROL          PLAN     ÚLTIMO ACCESO   ALTA  │
│ ☐ Ana Ruiz         ana@club.es         Cencerros     Organizador  Club     hace 2 min    3 sep  │
│ ☑ Luis Gil         luis@…              —             Piloto       —        hace 9 d      1 oct  │
│ ☑ test-123         t@mailinator…       —             Piloto       —        nunca         4 oct  │
│ ── 2 seleccionadas: [Cambiar rol…] [Restablecer contraseña] [Eliminar…]          ‹ 1 2 3 … 21 › │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
 Clic en una fila → panel lateral (patrón del panel de cliente de Stripe):
 ┌ LUIS GIL ─────────────────────────────── ✕ ┐
 │ luis@…  · Piloto · alta 1 oct               │
 │ Equipo: —   Eventos organizados: 0          │
 │ Plan: —     Cliente Stripe: —               │
 │ [Rol ▾ Piloto]  → al cambiar: confirmación  │
 │   «Luis podrá crear eventos» [Confirmar]    │
 │ [Ver como Luis (solo lectura)…]             │
 │ [Restablecer contraseña]                    │
 │ ── Zona de peligro ── [Eliminar cuenta…]    │
 │ Historial (auditoría de esta cuenta)        │
 └─────────────────────────────────────────────┘
```

- **Búsqueda y paginación en el servidor**: `GET /api/admin/users?q=&role=&page=&sort=`, con `ilike` y `limit/offset` (con este volumen basta; cursor más adelante).
- **Acciones masivas** con un único endpoint: `POST /api/admin/users/bulk {ids, action}`. Siempre con confirmación en línea, y escribe un registro de auditoría por cada usuario.
- **Cambio de rol con confirmación** y, al cambiarlo, `kick(u.id)`. Hoy el socket guarda el usuario del *handshake* (`live.js:103-108`), así que un organizador degradado sigue pudiendo dar banderas (`canRun`, `live.js:29`) hasta que reconecta.

#### Impersonación segura («Ver como»)

Patrones: la impersonación de Intercom y la de Retool, «Log in as user» de los paneles de soporte de SaaS. Lo que no puede faltar:

| Regla | Cómo |
|---|---|
| **Solo lectura** por defecto | El token de impersonación lleva `imp: adminId, ro: true`. `handleApi` (`api.js:527-557`) rechaza cualquier método distinto de `GET` con ese token (403 «Modo solo lectura») y el socket no se une a la sala del equipo como piloto (no puede emitir) |
| **Con motivo y caducidad** | Al pedirla se exige un motivo (texto) y dura 30 min (`exp` en el token HMAC de `auth.js`) |
| **Visible siempre** | Una franja fija de `bg-warn-solid`: «Estás viendo la app como Luis Gil · solo lectura · quedan 28 min · [Salir]» |
| **Auditada** | `audit_log` guarda quién, a quién, por qué, cuándo empieza y cuándo termina |
| **No sirve para escalar** | No se puede impersonar a otro admin, ni impersonar desde una impersonación |
| **Fuera del alcance** | No da acceso a la contraseña, ni al email con contraseña, ni a facturación (rutas `/api/billing/*` bloqueadas con `imp`) |

---

### A.3 Plan de implementación por fases

> Las estimaciones son en días de una persona que ya conoce el código. **D** = dificultad.

#### Fase 0 · Arreglos rápidos de seguridad en carrera (2 días, antes del próximo evento)

| Paso | D | Días | Archivos |
|---|---|---|---|
| Acuse con `socket.timeout(2000).emit` en `event:flag` (el servidor responde con `cb({ok})`); no enviar si `!connected`; estado «NO ENVIADA · Reintentar» | Media | 0,5 | `Events.jsx:167,233-264`, `live.js:119-123` |
| Denominador «visto n / participantes» y lista de los que faltan | Baja | 0,2 | `Events.jsx:167,251` |
| Confirmación de cambio de sesión (con `ConfirmButton`, o mantener pulsado) | Baja | 0,2 | `Events.jsx:154` |
| Mover Dirección de carrera a una barra `sticky top-0` del detalle | Baja | 0,2 | `Events.jsx:167` |
| Guardar el evento en el hash (`#eventos/12`) | Baja | 0,3 | `App.jsx:39-44`, `Events.jsx:20` |
| «Copiado ✓» (2 s) y confirmación en «Renovar código» | Baja | 0,1 | `Events.jsx:150-152` |
| Confirmar el cambio de rol y `kick` al cambiarlo | Baja | 0,2 | `Admin.jsx:60`, `api.js:481-487` |
| Errores de `TeamRow` junto a su formulario; «Guardado ✓» en `BlurInput`, que vuelve al valor anterior si falla | Baja | 0,2 | `Events.jsx:268-324` |
| Filas de la clasificación con teclado (`tabIndex=0`, Enter) y `sr-only` en «visto» | Baja | 0,1 | `Events.jsx:186,197-199` |

#### Fase 1 · Rutas, estados y espacio del evento (4 días)

| Paso | D | Días | Archivos |
|---|---|---|---|
| Hash con sub-rutas (`view/...rest`) y selector de modo en la cabecera | Media | 1 | `App.jsx`, `lib/mode.js` |
| Columna `events.draft` (eventos nuevos en `true`) y estado derivado en `eventSummary`; `/api/events/public` excluye los borradores | Baja | 0,5 | `db.js`, `api.js:36-37,390-404` |
| Lista de eventos con filtros por estado y acción siguiente; «+ Nuevo evento» abre el asistente | Media | 1 | `Events.jsx` (dividir en `events/List.jsx`, `events/Workspace.jsx`) |
| Espacio del evento con pestañas Resumen, Pista, Inscritos, Resultados y Ajustes (con la zona de peligro) | Media | 1,5 | `Events.jsx` → `views/events/*` |

#### Fase 2 · Asistente y checklist (3 días)

| Paso | D | Días | Archivos |
|---|---|---|---|
| Asistente de 4 pasos (estado en el hash `#eventos/nuevo/2`, un borrador real en BD desde el paso 1) | Media | 1,5 | `views/events/Wizard.jsx` |
| Importar pista: `GET /api/events/:id/track-sources` (pistas de `tracks` del equipo del organizador y de sus eventos anteriores) → `PATCH track` | Baja | 0,5 | `api.js`, `TrackMap.jsx` (prop `toolbar`) |
| Checklist (función pura `readiness(ev, cars, flag)` con su test en `src/lib/*.test.js`) | Baja | 0,5 | `src/lib/readiness.js` (+ test) |
| `max_teams` opcional y comprobación en la inscripción | Baja | 0,5 | `db.js`, `api.js:241-256` |

#### Fase 3 · Race Control (6 días)

| Paso | D | Días | Archivos |
|---|---|---|---|
| Tabla `event_log` y escritura de bandera, sesión y visto; restaurar la bandera activa al arrancar | Media | 1 | `db.js`, `live.js:26-34,137-142` |
| Vista `#control/:id`: rejilla, Fullscreen y Wake Lock, banner de conexión, torre con banda de estado | Media | 2 | `views/RaceControl.jsx`, `App.jsx` |
| Banderas: atajos de teclado, mantener pulsado para la roja, cuadros (`FLAGS += 'chequered'`), acuse y lista de faltantes | Media | 1 | `RaceControl.jsx`, `store.js:36-42`, `live.js`, `RaceFlag.jsx` |
| Reloj de sesión (`events.session_started_at`) y cambio de sesión con mantener pulsado | Baja | 0,5 | `db.js`, `api.js:406-419` |
| Registro en vivo (socket `event:log`) con exportación a CSV | Baja | 0,5 | `RaceControl.jsx`, `live.js` |
| Diseño adaptable (tableta y móvil «solo banderas») y pruebas en un móvil real | Media | 1 | `RaceControl.jsx` |

#### Fase 4 · Resultados (2 días)

| Paso | D | Días | Archivos |
|---|---|---|---|
| `event_results` (instantánea jsonb por sesión) y «Publicar resultado» | Baja | 0,5 | `db.js`, `api.js` |
| Exportación a CSV, CSS de impresión y enlace público de solo lectura `#tiempos/<código>` (ruta `none`, sin datos personales salvo el nombre del piloto) | Media | 1,5 | `views/Results.jsx`, `api.js` |

#### Fase 5 · Admin (8 días)

| Paso | D | Días | Archivos |
|---|---|---|---|
| `audit_log` y helper `audit(actor, action, target, data)` llamado desde las rutas de admin, de eventos y de facturación | Baja | 1 | `db.js`, `api.js` |
| `users.last_seen_at` (al hacer `userFromToken`, como mucho una escritura cada 5 min) | Baja | 0,3 | `api.js:12-17`, `db.js` |
| Búsqueda, filtros y paginación en el servidor; tabla con selección y panel lateral | Media | 2 | `api.js:475-480`, `Admin.jsx` → `views/admin/*` |
| Acciones masivas | Media | 1 | `api.js`, `admin/Users.jsx` |
| Resumen de métricas (una consulta agregada; «en vivo» sale de `live.js`) | Media | 1,5 | `api.js`, `live.js` (exportar un contador), `admin/Overview.jsx` |
| Impersonación de solo lectura (token, bloqueo de escritura, franja, auditoría) | **Alta** | 2,2 | `auth.js`, `api.js:527-557`, `live.js:103-108`, `App.jsx` |

**Total Parte A: unos 25 días** (la Fase 0 sola ya elimina los riesgos más graves del día de carrera).

---

## Parte B · Pagos

### B.1 Evaluación y decisión

#### Qué se vende

1. **Suscripción de organizador** (SaaS B2B en su mayoría: clubes, circuitos y asociaciones; a veces un particular).
2. **Pase por evento** (un pago único).
3. (Más adelante) **Inscripciones de equipos cobradas por el organizador** a través de la app. Esto es otro problema: es un *marketplace* y el servicio es la entrada a un evento presencial.

#### Comisiones vigentes (consultadas el 05/10/2026)

| Proveedor | Tarjeta EEE estándar | Otras | Suscripciones e IVA | MoR (*Merchant of Record*) | Fuente |
|---|---|---|---|---|---|
| **Stripe** (España) | 1,5 % + 0,25 € | EEE *premium*/empresa 2,8 % + 0,25 €; Reino Unido 2,5 % + 0,25 €; internacional 3,15 % + 0,25 €; +2 % con conversión de divisa | Billing 0,7 % del volumen (sin cuota); Stripe Tax Basic 0,5 % por transacción (sin código) o 0,45 € por cálculo vía API; Invoicing 0,4 % por factura pagada | No (tú eres el vendedor) | https://stripe.com/es/pricing |
| **Stripe Managed Payments** | Lo anterior **+ 3,5 %** | — | IVA, GST y *sales tax* en más de 80 países, fraude, disputas y soporte por transacción | **Sí** (Stripe) | https://stripe.com/es/pricing · https://docs.stripe.com/payments/managed-payments |
| **Paddle** | 5 % + 0,50 $ todo incluido | Precio a medida por debajo de 10 $ | Incluidos | **Sí** | https://www.paddle.com/pricing |
| **Lemon Squeezy** | (5 % + 0,50 $, histórico) | — | Incluidos | Sí | En transición hacia Stripe Managed Payments; soporte más lento y altas que tardan semanas (https://alexcloudstar.com/blog/merchant-of-record-indie-saas-2026/, https://dodopayments.com/blogs/lemonsqueezy-alternatives) |
| **Mollie** | 1,80 % + 0,25 € (consumo) | Empresa EEE 2,90 % + 0,25 €; fuera del EEE 3,25 % + 0,25 €; Bizum: tarifa del adquirente + 0,10 % + 0,10 €; SEPA DD 0,35 € | IVA a tu cargo; plan Pro de 20 €/mes | No | https://www.mollie.com/es/pricing |
| **Redsys** (TPV del banco) | 0,30–1,50 % negociado con el banco | Bizum nativo | Sin portal de cliente ni gestión de suscripciones o IVA; tokenización COF manual; no se contrata en línea | No | https://sincomisiones.org/tpv-virtual/tpv-virtual-redsys |

**Elegibilidad de Managed Payments** (https://docs.stripe.com/payments/managed-payments/eligibility):
- **España sí está** entre los países admitidos y el SaaS B2B (`txcd_10103001`) es una categoría elegible.
- Excluye expresamente los **«Live in-person events»**, los *marketplaces* y las cuentas **Connect**. Solo funciona con Checkout y Payment Links.

#### Coste por cobro (IVA aparte, tarjeta EEE estándar)

| | Suscripción Club 29 €/mes | Pase de evento 49 € |
|---|---|---|
| Stripe + Billing + Tax Basic | 0,69 + 0,20 + 0,15 ≈ **1,04 € (3,6 %)** | 0,985 + 0,25 (Tax) ≈ **1,23 € (2,5 %)** (+0,20 € si se emite factura con Invoicing) |
| Stripe Managed Payments | 1,04 + 1,02 ≈ **2,06 € (7,1 %)** | 1,23 + 1,72 ≈ **2,95 € (6,0 %)** |
| Paddle | 1,45 + ~0,43 ≈ **1,88 € (6,5 %)** | 2,45 + ~0,43 ≈ **2,88 € (5,9 %)** |
| Mollie (con IVA y suscripción a tu cargo) | ≈ 0,77 € (tarjeta de consumo) / 1,09 € (de empresa) | ≈ 1,13 € / 1,67 € |

> Con tarjeta de empresa en Stripe (2,8 %), la fila de Stripe sube unos 0,38 € en los 29 €. Los organizadores B2B suelen pagar con tarjeta de empresa. Para cuotas recurrentes, SEPA Direct Debit sale más barato.

#### IVA para un fundador en España (lo que de verdad cuesta tiempo)

- **B2B dentro de la UE** (lo normal con organizadores): **inversión del sujeto pasivo**. Hace falta estar dado de alta en el **ROI** (Registro de Operadores Intracomunitarios, modelo 036) y validar el NIF-IVA (VIES) del cliente. Stripe Tax hace la validación si se activa `tax_id_collection` y aplica la inversión cuando el NIF-IVA es válido (https://docs.stripe.com/tax/supported-countries/european-union).
- **B2C en otros países de la UE**: por debajo de 10.000 €/año en total se aplica el IVA español (la opción *small seller* de Stripe). Por encima, toca **OSS** (ventanilla única, modelo 369 trimestral). Stripe Tax lleva la cuenta del umbral y avisa.
- **Fuera de la UE**: depende del país (Reino Unido, Suiza, Noruega, Australia…). Stripe Tax monitoriza los umbrales, pero registrarse y declarar sigue siendo cosa tuya. Un MoR te quita todo esto.
- **Facturación en España (VERI\*FACTU)**: obligatorio desde el **1/1/2027 para sociedades y el 1/7/2027 para autónomos** (RDL 15/2025, https://www.infoautonomos.com/blog/verifactu-cuando-es-obligatorio-a-quien-afecta/). **No he podido confirmar que las facturas de Stripe cumplan VERI\*FACTU**: hay que verificarlo con Stripe o con la gestoría antes de 2027. Con un **MoR**, quien factura al cliente es el MoR y tú solo emites una factura periódica al MoR, lo que simplifica mucho este punto.

#### Inscripciones cobradas por el organizador: Stripe Connect

- Es un *marketplace*: el dinero es del organizador. Managed Payments y Paddle **no sirven** para esto (MP excluye Connect y los eventos presenciales).
- **Precios de Connect** (https://stripe.com/es/connect/pricing):
  - Si «Stripe gestiona los precios» (el organizador tiene su propia cuenta y paga las comisiones de Stripe), la plataforma **no paga nada a Connect**.
  - Si los gestiona la plataforma, son 2 € por cuenta activa al mes más 0,25 % + 0,10 € por transferencia.
- **Recomendación**: cuentas conectadas con panel completo de Stripe (el antiguo *Standard*) y **cargos directos** (*direct charges*) con `application_fee_amount`.
  - El organizador es el vendedor: emite su factura y responde de reembolsos y disputas.
  - El **IVA de la inscripción** es del organizador, porque el lugar de realización es donde se celebra el evento (Stripe Tax, «Services related to admission to events»).
  - La plataforma solo factura (con IVA) su comisión al organizador.
  - Es el modelo con menos responsabilidad y cero coste fijo.
- En Google Play, los pagos de **entradas a eventos presenciales** están fuera de la facturación obligatoria de Play (https://support.google.com/googleplay/android-developer/answer/9858738).

#### Decisión

**Stripe (Checkout + Billing + Customer Portal + Stripe Tax Basic), en una cuenta normal (no MoR), y Connect cuando se quiera cobrar inscripciones.**

Motivos:
1. Es el más barato de los completos (≈ 3,6 % frente a 6–7 % de los MoR) y no tiene cuota.
2. Es el único que cubre **los tres casos** (suscripción, pase y *marketplace*) con una sola integración. Si se eligiera Managed Payments, esa cuenta no podría usar Connect.
3. El cliente principal es **B2B en la UE**: inversión del sujeto pasivo y casi ningún B2C transfronterizo, que es justo donde un MoR se gana su comisión.
4. Checkout es una página alojada, así que el cumplimiento PCI es SAQ A.
5. La salida a MoR es barata: si las ventas B2C fuera de la UE crecen o VERI\*FACTU complica la facturación, Managed Payments se activa sobre la misma integración de Checkout (https://docs.stripe.com/payments/managed-payments). Sería, eso sí, en una cuenta separada de la de Connect.

Descartes:
- **Paddle**: bueno, pero no cubre inscripciones y cuesta casi el doble.
- **Lemon Squeezy**: en transición.
- **Mollie**: válido y con Bizum, pero hay menos ecosistema (Tax, Portal y test clocks).
- **Redsys**: comisiones mínimas, pero obliga a construir suscripciones, portal, IVA y facturas a mano. Solo compensa a gran volumen y en España.

---

### B.2 Implementación con Stripe en esta base de código

#### Arquitectura

```
Web (no WebView)                          server/index.js
  #plan ──POST /api/billing/checkout──▶ api.js ──stripe.checkout.sessions.create──▶ Stripe Checkout
  ◀── 303 a url de Stripe ──────────────                                             │ (pago)
  #plan?ok=cs_… ──POST /api/billing/sync──▶ api.js ──retrieve(cs)──▶ upsert          │
                                                                                     ▼
  Stripe ──POST /api/stripe/webhook (cuerpo crudo, firmado)──▶ index.js → billing.js → upsert BD
  #plan ──POST /api/billing/portal──▶ billing_portal.sessions.create ──▶ Customer Portal
  POST /api/events ──▶ entitlements(user) ──▶ ¿cabe en el plan? sí: crea / no: 402 + motivo
```

- **Dependencia**: `stripe` (SDK oficial). Es la única nueva. En el camino del dinero compensa: firma de webhooks, reintentos con claves de idempotencia y versión de API fijada. La alternativa sin dependencia (`fetch` + `crypto.timingSafeEqual`) cabe en 40 líneas, pero no merece la pena arriesgarse con el dinero.
- **Archivo nuevo** `server/billing.js`: rutas, webhook y `entitlements()`. Las rutas se añaden al array `routes` de `api.js` siguiendo el patrón `[método, ruta, acceso, handler]`.
- **Variables de entorno**: `STRIPE_SECRET_KEY` (en producción, una **clave restringida** solo con permisos de Checkout, Customers, Subscriptions, Billing Portal y lectura de Invoices), `STRIPE_WEBHOOK_SECRET` y `APP_URL`. Si no existen, la facturación se desactiva y todo funciona como hoy (sin límites, como «cortesía»), igual que la base de datos cae a PGlite sin `DATABASE_URL`.

#### Paso 0 · Cuenta y producto (sin código)

| Tarea | D | Días |
|---|---|---|
| Alta en Stripe (NIF, banco), activar Stripe Tax con origen en España, registros (España + *small seller*, o OSS) y ROI (modelo 036, con la gestoría) | Baja | 0,5 (+ trámites) |
| Productos y precios en el panel con **`lookup_key`**: `club_month`, `club_year`, `pro_month`, `pro_year`, `event_pass`. Precios **sin IVA** (`tax_behavior=exclusive`, B2B) y código fiscal `txcd_10103001` (SaaS business use) | Baja | 0,25 |
| Configurar el Customer Portal: cambiar de plan entre los precios anteriores, cancelar **al final del periodo**, actualizar el método de pago, ver facturas y añadir NIF-IVA | Baja | 0,25 |
| Textos legales: condiciones, renovación y cancelación, y **desistimiento de 14 días** para consumidores (el contenido digital exige consentimiento expreso para empezar a prestar el servicio) | Baja | 0,5 |

#### Paso 1 · Esquema SQL (en `SCHEMA()` de `server/db.js`, mismo estilo e idempotente)

```sql
  -- Facturación (Stripe). Cliente de Stripe del usuario que paga (organizador). Sin Stripe configurado, nada de esto se usa.
  alter table users add column if not exists stripe_customer_id text unique;
  -- Plan concedido por el admin sin pago ('club', 'pro'): cortesía, pruebas, clubes con acuerdo. Manda sobre la suscripción.
  alter table users add column if not exists plan_override text;
  -- Suscripción: copia de la de Stripe (la fuente de verdad es Stripe; esto se reescribe entero en cada webhook).
  create table if not exists subscriptions (
    id text primary key,                     -- sub_…
    user_id int not null references users(id) on delete cascade,
    plan text not null,                      -- 'club' | 'pro' (de lookup_key del precio: club_month → club)
    price text not null,                     -- lookup_key: 'club_month', 'pro_year'…
    status text not null,                    -- trialing | active | past_due | unpaid | canceled | incomplete | incomplete_expired | paused
    current_period_end timestamptz,
    cancel_at_period_end boolean not null default false,
    updated_at timestamptz not null default now()
  );
  create index if not exists subscriptions_user on subscriptions (user_id);
  -- Pase de evento (pago único): se gasta al publicar un evento. checkout_id único = un pago nunca da dos pases.
  create table if not exists event_passes (
    id serial primary key,
    user_id int not null references users(id) on delete cascade,
    checkout_id text unique not null,        -- cs_…
    amount int not null,                     -- céntimos, sin IVA
    currency text not null,
    event_id int references events(id) on delete set null, -- null: sin gastar
    refunded boolean not null default false,
    created_at timestamptz not null default now()
  );
  -- Cómo se pagó cada evento: 'plan' | 'pass' | 'comp' (cortesía/admin) | null (anterior a la facturación).
  alter table events add column if not exists billing text;
  -- Webhooks recibidos: registro e idempotencia de los efectos no repetibles (emails, avisos).
  create table if not exists stripe_events (
    id text primary key,                     -- evt_…
    type text not null,
    received_at timestamptz not null default now()
  );
  -- Auditoría (Parte A) también para facturación: reembolsos, planes de cortesía, cambios de rol por pago.
  create table if not exists audit_log (
    id bigserial primary key,
    actor_id int references users(id) on delete set null, -- null: sistema (webhook)
    action text not null,                    -- 'role.set', 'plan.override', 'billing.subscription', 'impersonate.start'…
    target text,                             -- 'user:12', 'event:5'
    data jsonb,
    created_at timestamptz not null default now()
  );
  create index if not exists audit_log_time on audit_log (created_at desc);
  -- Registro de dirección de carrera (Parte A): banderas, sesiones, vistos. Sobrevive a reinicios.
  create table if not exists event_log (
    id bigserial primary key,
    event_id int not null references events(id) on delete cascade,
    ts timestamptz not null default now(),
    kind text not null,                      -- 'flag' | 'session' | 'seen' | 'result'
    actor_id int references users(id) on delete set null,
    data jsonb
  );
  create index if not exists event_log_event on event_log (event_id, ts);
```

> Añadir `subscriptions`, `event_passes`, `audit_log` y `event_log` a `TABLES` en `server/migrate.js:9` para la próxima migración. `stripe_events` no hace falta.

| D | Días |
|---|---|
| Baja | 0,5 |

#### Paso 2 · Planes y límites (función pura y con test)

```js
// server/billing.js
export const PLANS = {
  free: { label: 'Gratis', activeEvents: 1, teamsPerEvent: 3 },  // probar con amigos
  pass: { label: 'Pase',   activeEvents: 0, teamsPerEvent: 30 }, // el pase da +1 evento, ver canCreateEvent
  club: { label: 'Club',   activeEvents: 3, teamsPerEvent: 20 },
  pro:  { label: 'Pro',    activeEvents: Infinity, teamsPerEvent: 60, results: true, publicTiming: true },
};
const LIVE = ['active', 'trialing', 'past_due']; // past_due: periodo de gracia mientras Stripe reintenta el cobro
// Plan efectivo: el que da el admin, si no la suscripción viva, si no gratis.
export const planOf = (user, subs) => user.plan_override
  ?? subs.find((s) => LIVE.includes(s.status))?.plan ?? 'free';
```

- **Evento activo** = no borrador y (`starts_on` es null o `starts_on >= current_date - 1`).
- `canCreateEvent`: `activos < PLANS[plan].activeEvents` → `billing = 'plan'`; si no, ¿hay un pase sin gastar? → se gasta (`update event_passes set event_id = $1 where id = (select id … for update skip locked limit 1)`) y `billing = 'pass'`; si no, **402** con `{ error, upgrade: true }`.
- Dónde se comprueba:
  - Al **publicar** (paso del asistente, `draft → false`), no al crear: así se pueden preparar borradores gratis.
  - En `POST /api/team/enroll` (`api.js:241`), contra `teamsPerEvent` del plan con el que se pagó el evento.
- **Regla de oro: nunca se corta el día de carrera.** Los límites solo se comprueban al publicar y al inscribir. Banderas, mapa, clasificación y sesión (`live.js`, `standings`) no consultan el plan. Un evento ya pagado sigue funcionando aunque la suscripción caduque después.
- **Rol**:
  - Al quedar activa una suscripción, si `role = 'pilot'` pasa a `'organizer'` (con auditoría y `kick` para refrescar el socket).
  - Al cancelarse **no se quita el rol**: el plan pasa a `free` (solo lectura de lo antiguo y 1 evento activo). Así nunca se pierde el acceso a eventos e historial ya existentes.
  - El admin sigue pudiendo dar el rol a mano (`plan_override` para cortesía).
- `isOrganizer` (`api.js:75`) no cambia. Las nuevas comprobaciones (`entitlements`) solo afectan a crear, publicar e inscribir.

| D | Días |
|---|---|
| Media | 1 (con test `server/billing.test.js`: `planOf`, `canCreateEvent` con pases y casos `past_due`, `canceled` y `override`) |

#### Paso 3 · Checkout (suscripción y pase)

```js
// Precios permitidos: el cliente solo elige la clave; el importe lo pone Stripe. Nunca un price/amount del cuerpo.
const PRICES = new Set(['club_month', 'club_year', 'pro_month', 'pro_year', 'event_pass']);

['POST', '/api/billing/checkout', 'user', async ({ user, body }) => {
  if (!PRICES.has(body.price)) fail(400, 'Plan no válido.');
  const [price] = (await stripe.prices.list({ lookup_keys: [body.price], active: true })).data;
  const customer = user.stripe_customer_id ?? await createCustomer(user); // metadata.user_id; guarda el id
  const sub = body.price !== 'event_pass';
  const s = await stripe.checkout.sessions.create({
    mode: sub ? 'subscription' : 'payment',
    customer, client_reference_id: String(user.id),
    line_items: [{ price: price.id, quantity: 1 }],
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },                 // NIF-IVA → inversión del sujeto pasivo
    customer_update: { address: 'auto', name: 'auto' },
    billing_address_collection: 'required',
    ...(sub ? { subscription_data: { metadata: { user_id: user.id } } }
            : { invoice_creation: { enabled: true }, metadata: { user_id: user.id, kind: 'event_pass' } }),
    success_url: `${APP_URL}/#plan?ok={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/#plan`,
  }, { idempotencyKey: `co-${user.id}-${body.price}-${body.nonce}` }); // nonce del cliente: doble clic = una sesión
  return { url: s.url };
}],
```

- El cliente hace `location.href = url`.
- **No se permite una segunda suscripción**: si el usuario ya tiene una viva, se devuelve el Portal en lugar de Checkout.
- `invoice_creation` en el pase genera una factura con IVA (Invoicing, 0,4 %). Sin ella, el cliente B2B no tiene factura.

| D | Días |
|---|---|
| Media | 1 |

#### Paso 4 · Webhook (firma, idempotencia y orden)

Tiene que ir **antes** de `handleApi`, porque `readBody` (`api.js:514-525`) parsea JSON y Stripe firma el **cuerpo crudo**:

```js
// server/index.js, primera línea del handler http
if (req.method === 'POST' && req.url === '/api/stripe/webhook') return stripeWebhook(req, res);
```

```js
// server/billing.js
export async function stripeWebhook(req, res) {
  const chunks = []; for await (const c of req) chunks.push(c);
  let ev;
  try { ev = stripe.webhooks.constructEvent(Buffer.concat(chunks), req.headers['stripe-signature'], WEBHOOK_SECRET); }
  catch { return res.writeHead(400).end(); }                       // firma o tolerancia (5 min) inválidas
  try {
    await handle(ev);                                               // idempotente: re-lee de Stripe y hace upsert
    await q('insert into stripe_events (id, type) values ($1, $2) on conflict do nothing', [ev.id, ev.type]);
    res.writeHead(200).end();
  } catch (e) { console.error(e); res.writeHead(500).end(); }       // Stripe reintenta hasta 3 días
}

async function handle(ev) {
  const o = ev.data.object;
  switch (ev.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return o.mode === 'payment' ? grantPass(o.id) : syncSubscription(o.subscription);
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return syncSubscription(o.id);
    case 'invoice.payment_failed':  return notifyPaymentFailed(ev.id, o); // aviso único (stripe_events)
    case 'charge.refunded':         return refundPass(o.payment_intent);
  }
}
```

- **Idempotencia y orden**: los eventos pueden llegar repetidos o desordenados. Por eso `syncSubscription(id)` **vuelve a pedir la suscripción a Stripe** (`stripe.subscriptions.retrieve`) y sobrescribe la fila (`insert … on conflict (id) do update`). Procesar dos veces da el mismo resultado. `grantPass` usa `checkout_id unique … on conflict do nothing`. Los efectos que no se pueden repetir (un email) consultan antes `stripe_events`.
- Se marca el evento como procesado **después** de manejarlo. Si falla a medias, se devuelve 500 y Stripe reintenta, y como los *handlers* son *upserts* no se duplica nada. Con eso basta sin transacciones (`db.js` solo expone `q`/`one`).
- **Fin del periodo**: en las versiones de API desde `2025-03-31.basil`, `current_period_end` está en `subscription.items.data[0]`. Hay que fijar `apiVersion` en el cliente del SDK.
- **Render free se duerme**: el primer webhook despierta el servicio (unos 30–60 s), y si da *timeout* Stripe reintenta. Además, `POST /api/billing/sync {sessionId}` desde la `success_url` reconcilia al momento (recupera la sesión, comprueba `client_reference_id === user.id` y sincroniza). Así el usuario ve su plan sin esperar al webhook. Cobrando dinero, conviene pasar a **Render Starter**, porque las banderas en memoria y el *cold start* ya lo pedían.
- Eventos que activar en el endpoint del panel: los 7 del `switch`.

| D | Días |
|---|---|
| Media | 1,5 |

#### Paso 5 · Customer Portal

```js
['POST', '/api/billing/portal', 'user', async ({ user }) => {
  if (!user.stripe_customer_id) fail(409, 'Aún no tienes facturación.');
  const s = await stripe.billingPortal.sessions.create({ customer: user.stripe_customer_id, return_url: `${APP_URL}/#plan` });
  return { url: s.url };
}],
```

Los cambios de plan y las cancelaciones hechos en el Portal llegan por `customer.subscription.updated`: no hace falta código extra.

| D | Días |
|---|---|
| Baja | 0,25 |

#### Paso 6 · Interfaz

| Pieza | Detalle | D | Días |
|---|---|---|---|
| `#plan` (modo Organizador; también en Piloto como «Organiza un evento») | Tabla de planes, plan actual, uso («2 de 3 eventos activos»), pases sin gastar, botones Checkout y «Gestionar facturación» (Portal) | Media | 1 |
| Avisos | `past_due`: franja ámbar «No hemos podido cobrar · Actualiza tu tarjeta» (enlace al Portal). `cancel_at_period_end`: «Tu plan acaba el 31 oct» | Baja | 0,3 |
| Error 402 al publicar o inscribir | Mensaje junto a la acción: «Tu plan Club permite 3 eventos activos. [Usar un pase] [Pasar a Pro]» | Baja | 0,3 |
| Admin · Facturación | Lista de suscripciones (estado y plan), MRR = suma de las activas normalizada a mensual, `plan_override` con motivo (auditado) y enlace al cliente en el panel de Stripe (`https://dashboard.stripe.com/customers/<id>`) | Media | 1 |
| Al pagar, cambiar a modo Organizador | `setMode('organizer')` tras `sync` | Baja | 0,1 |

#### Paso 7 · Pruebas (modo test y Stripe CLI)

> ⚠ **Nunca con `DATABASE_URL` de producción.** El servidor de `localhost:3300` de este equipo apunta a Neon de producción. Las pruebas de pago se hacen con `PGLITE_DIR=memory:// PORT=3477 node server/index.js` y claves `sk_test_…`. En Render solo van las claves *live*.

```bash
stripe login
stripe listen --forward-to localhost:3477/api/stripe/webhook   # imprime whsec_… → STRIPE_WEBHOOK_SECRET
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_failed
# Renovación, fallo de cobro y fin de periodo sin esperar un mes: test clocks
stripe test_helpers test_clocks create --frozen-time $(date +%s)
```

Tarjetas de prueba:
- `4242 4242 4242 4242`: pago correcto.
- `4000 0025 0000 3155`: pide 3DS/SCA.
- `4000 0000 0000 0341`: se guarda pero falla al cobrar, sirve para `past_due`.
- NIF-IVA de prueba con prefijo `ES` para comprobar la inversión del sujeto pasivo.

Tests automáticos (`node --test`, sin red), en `server/billing.test.js`:
1. `planOf` y `canCreateEvent`, con todos los estados.
2. Webhook con firma: construir la cabecera `Stripe-Signature` con `stripe.webhooks.generateTestHeaderString` y comprobar que un cuerpo alterado devuelve 400 y que el mismo `evt_` dos veces deja **una** fila y un pase.
3. En `api.test.js`, que publicar un segundo evento con el plan gratis devuelve 402.

| D | Días |
|---|---|
| Media | 1,5 |

#### Paso 8 · Facturas e IVA

- Suscripciones: Billing emite la factura de cada periodo con el IVA de Stripe Tax (o con «Inversión del sujeto pasivo» y el NIF-IVA del cliente) y la envía por email. El cliente las descarga desde el Portal.
- Pase: con `invoice_creation`.
- Numeración y datos fiscales del emisor en *Settings → Invoices*.
- Exportar cada trimestre los informes de Stripe Tax para los modelos 303, 349 (intracomunitarias B2B) y 369 (OSS, si aplica), en coordinación con la gestoría.
- **Pendiente antes de 2027**: confirmar si Stripe Invoicing cumple VERI\*FACTU. Si no, enviar las facturas a un programa homologado (por webhook `invoice.finalized` → API del programa) o pasar a Managed Payments.

| D | Días |
|---|---|
| Baja (técnica) / Media (fiscal) | 0,5 |

#### Paso 9 · APK Android y políticas de Google Play

- **Hoy la APK se distribuye fuera de Play** (Releases de GitHub, `CONTEXTO.md`). Las políticas de pagos de Play solo afectan a las apps publicadas en Play (https://support.google.com/googleplay/android-developer/answer/9858738).
- **Verificación de desarrolladores** de Android: a partir de septiembre de 2026 es obligatoria también para instalar fuera de Play (*sideload*) en Brasil, Indonesia, Singapur y Tailandia, y desde 2027 en todo el mundo (https://www.androidauthority.com/android-sideloading-changes-timeline-3679204/). Hay que **verificar la identidad y registrar el paquete y la firma** (`CN=Cencerro Racing`) en la consola de desarrolladores antes de 2027, o la APK dejará de instalarse en móviles certificados.
- **Si algún día se publica en Play**: la suscripción de organizador es *business productivity software*, que entra en la facturación obligatoria de Play. Está prohibido llevar al usuario a pagar fuera mediante «webviews, botones, enlaces…». En el EEE existen el *Billing Choice Program* y el de *external offers* (10 % sobre suscripciones con facturación alternativa o enlace externo desde el 30/06/2026, https://support.google.com/googleplay/android-developer/answer/17161464).
- **Recomendación** (válida dentro y fuera de Play): la APK es la app del **piloto y del BOX**, y la compra se hace **solo en la web**.
  - En el WebView (`Capacitor.isNativePlatform()`, o `; wv)` en el user agent, como ya hace `server/index.js:17-21`) **no se muestran ni precios, ni botones de compra, ni enlaces a `#plan`**.
  - Un organizador que ya ha pagado puede usar sus funciones en la APK (acceso a algo comprado fuera), pero la app no menciona dónde comprarlo.
  - El servidor también rechaza `/api/billing/checkout` si la cabecera indica WebView, como defensa extra.
  - Las **inscripciones a eventos presenciales** por Connect están exentas de la facturación de Play («tickets for live events»).

| D | Días |
|---|---|
| Baja | 0,25 (ocultar) + trámite de verificación |

#### Paso 10 · Seguridad

| Riesgo | Medida |
|---|---|
| Manipular el precio | Solo `lookup_key` de una lista blanca; el importe sale de Stripe |
| Webhook falso | `constructEvent` con `STRIPE_WEBHOOK_SECRET`, cuerpo crudo y tolerancia de 5 min. Sin firma, 400 sin detalles |
| Repeticiones | `stripe_events` y *upserts* por id de Stripe; `checkout_id unique` |
| Robar el plan de otro con `sync` | Comprobar `session.client_reference_id === String(user.id)` |
| Fuga de claves | Clave restringida en Render (variables de entorno, nunca en el repo ni en el *bundle*); `sk_test` y `sk_live` separadas por entorno |
| Abuso de Checkout | Limitar a 5 sesiones por usuario y hora (en memoria, como las banderas; una sola instancia). Va con el pendiente nº 6 «limitar intentos de login» |
| Impersonación y pagos | El token `imp` no puede llamar a `/api/billing/*` |
| PCI | Checkout y Portal alojados por Stripe: no pasa ninguna tarjeta por el servidor (SAQ A) |
| RGPD | Firmar el DPA de Stripe y mencionarlo en la política de privacidad; en `DELETE /api/me` (`api.js:193`), cancelar la suscripción y conservar `stripe_customer_id` solo si la ley obliga a guardar facturas (se queda en Stripe) |
| Fallo de Stripe el día de carrera | Las funciones en vivo no dependen de Stripe (regla de oro del Paso 2) |

| D | Días |
|---|---|
| Media | 0,5 |

#### Paso 11 · (Más adelante) Inscripciones con Stripe Connect

| Tarea | D | Días |
|---|---|---|
| `users.stripe_account_id`; onboarding con Account Links (cuenta con panel completo, KYC de Stripe); `account.updated` → `charges_enabled` | Media | 1,5 |
| `events.entry_fee` (céntimos) y `team_payments (team_id, event_id, checkout_id unique, status)`; la inscripción de pago crea Checkout como **cargo directo** en la cuenta del organizador (`stripeAccount`) con `application_fee_amount` | Alta | 2 |
| Webhook de Connect (otro endpoint o el mismo con `ev.account`), reembolsos y disputas a cargo del organizador; el equipo solo cuenta como inscrito al quedar `paid` | Alta | 1,5 |
| Facturar la comisión de la plataforma al organizador (IVA de servicio B2B) | Media | 0,5 |

#### Resumen de la Parte B

| Paso | D | Días |
|---|---|---|
| 0 Cuenta, productos, Portal y textos legales | Baja | 1,5 |
| 1 Esquema SQL | Baja | 0,5 |
| 2 Planes, límites y rol | Media | 1 |
| 3 Checkout | Media | 1 |
| 4 Webhook y sincronización | Media | 1,5 |
| 5 Customer Portal | Baja | 0,25 |
| 6 Interfaz (Plan, avisos, 402, admin) | Media | 2,7 |
| 7 Pruebas (CLI, test clocks, tests) | Media | 1,5 |
| 8 Facturas e IVA | Baja/Media | 0,5 |
| 9 Android (ocultar compra) | Baja | 0,25 |
| 10 Seguridad | Media | 0,5 |
| **Total suscripción + pase** | | **≈ 11 días** |
| 11 Connect (opcional) | Alta | 5,5 |

**Orden recomendado**:
1. Fase 0 de la Parte A, antes del próximo evento.
2. Pasos 0–10 de Pagos, con la Fase 1 de A (`draft` y estados, que hacen falta para «publicar = consumir el plan»).
3. Asistente y Race Control.
4. Admin (la auditoría se adelanta si se cobra).
5. Connect, solo cuando un organizador lo pida.

---

### Fuentes

- Stripe, precios en España: https://stripe.com/es/pricing
- Stripe Connect, precios: https://stripe.com/es/connect/pricing
- Stripe Managed Payments: https://docs.stripe.com/payments/managed-payments · elegibilidad: https://docs.stripe.com/payments/managed-payments/eligibility
- Stripe Tax en la UE: https://docs.stripe.com/tax/supported-countries/european-union
- Paddle, precios: https://www.paddle.com/pricing
- Mollie, precios en España: https://www.mollie.com/es/pricing
- Redsys, comisiones: https://sincomisiones.org/tpv-virtual/tpv-virtual-redsys
- Lemon Squeezy y Stripe en 2026: https://alexcloudstar.com/blog/merchant-of-record-indie-saas-2026/ · https://dodopayments.com/blogs/lemonsqueezy-alternatives · https://dodopayments.com/blogs/stripe-managed-payments-fees-explained
- Google Play, cuándo es obligatoria su facturación: https://support.google.com/googleplay/android-developer/answer/9858738
- Google Play, Billing Choice Program: https://support.google.com/googleplay/android-developer/answer/17161464
- Verificación de desarrolladores de Android: https://www.androidauthority.com/android-sideloading-changes-timeline-3679204/
- VERI\*FACTU, plazos: https://www.infoautonomos.com/blog/verifactu-cuando-es-obligatorio-a-quien-afecta/

---
