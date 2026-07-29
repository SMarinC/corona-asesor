# Guion de demo — Corona Asesor (para startups/inversionistas)

Duración total: ~3:30 min. App corriendo en http://localhost:8501

---

## ⚠️ Contexto real de cuota (léelo antes de grabar)

Estás en el **free tier de Gemini** (250K tokens/minuto). El agente Corona hace
varias llamadas al modelo por mensaje (una por cada paso de tool-use: buscar
producto, calcular cajas, validar compatibilidad, etc.), y el número de pasos
varía un poco cada vez que corres la misma pregunta. Esto significa: **hay
probabilidad real de un error 429 ("cuota excedida") en algún punto de la
grabación.** No es un bug del código — es un límite de la cuenta gratuita.

Dos formas de bajar el riesgo a casi cero:
1. **(Recomendado, 5 min, gratis)** Habilita billing en Google Cloud para tu
   proyecto: console.cloud.google.com/billing → vincular cuenta de facturación
   al proyecto de tu API key. No te cobra en uso bajo, pero sube MUCHO el
   límite de tokens/minuto.
2. **(Sin tocar nada)** Sigue el protocolo de reintento de este guion — deja
   pausas de verdad entre mensajes (no cosméticas) para que la ventana de 1
   minuto se libere, y ten paciencia si hay que reintentar una vez.

---

## Preparación (antes de grabar, SIN cámara)

1. Abre http://localhost:8501 en una ventana limpia, sin otras pestañas.
2. **NO hagas un ensayo completo justo antes de grabar** — cada ensayo gasta
   cuota de la misma ventana de 1 minuto que vas a necesitar para la toma
   real. Si quieres ensayar, hazlo y luego espera 2-3 minutos completos antes
   de grabar en serio.
3. Activa "No molestar" en Windows (evita notificaciones en cámara).
4. Ten a la mano un cronómetro o mira el reloj — vas a necesitar pausas reales
   de 45-60s entre ciertos pasos, no solo "hablar más lento".
5. Graba con Win+G o el Grabador de pantalla de Windows, 1920x1080.

---

## 0:00 – 0:20 — Apertura

**Decir (cámara en la pantalla de bienvenida):**
> "Esto es Corona Asesor: un agente de IA que ayuda a cotizar pisos y revestimientos con datos reales del catálogo de Corona — no con suposiciones del modelo. Les muestro cómo funciona con un caso real."

---

## 0:20 – 1:00 — Mensaje único con el proyecto completo

**Escribe en el chat EXACTAMENTE esto (probado — evita combinaciones que no
existen en el catálogo y agrupa lo esencial en una sola pasada de tool-use):**
```
Hola, tengo un baño interior de 3 metros de largo por 2 metros de ancho, es zona húmeda, me gusta el diseño marmolizado, y mi presupuesto es de 2.000.000 de pesos. Recomiéndame el piso, el pegante y la boquilla, calcula las cantidades exactas y dime si alcanza con mi presupuesto.
```

**Mientras carga (puede tardar 15-30s, son varios pasos internos), decir:**
> "Es una sola indicación en lenguaje natural, como le hablarías a un asesor en tienda. Por dentro, el agente está encadenando automáticamente: cálculo de área, búsqueda en catálogo, cálculo de cajas, pegante, boquilla y validación de presupuesto — se los muestro en la traza en un momento."

**Si sale error "tuve un problema hablando con el modelo":** No te alarmes ni
cortes la grabación. Di en cámara: *"vamos a esperar un segundo, a veces el
proveedor del modelo pide una pausa"*, cuenta 45 segundos en silencio o
narrando la arquitectura (usa el texto de la sección 2:15 más abajo como
relleno), y vuelve a enviar el MISMO mensaje. Esto se edita fácil en post.

---

## 1:00 – 1:50 — Mostrar el "grounding" (el diferenciador real)

**Acción:** Abre el expander/panel de "herramientas" o "trace".

**Decir:**
> "Esto es lo importante para nosotros como negocio: cada número que ven no lo inventa el modelo de lenguaje. Miren esta traza — el agente consultó la base de datos real del catálogo, calculó cajas con el rendimiento real del producto, buscó el pegante y la boquilla compatibles, y validó todo contra reglas de negocio y mi presupuesto. Si el catálogo no tiene un dato, el agente lo dice explícitamente en vez de inventarlo. Eso es lo que evita alucinaciones en un caso de uso donde un error le cuesta plata real al cliente."

---

## 1:50 – 2:15 — Pausa real (no cosmética) antes del PDF

**Esto NO es opcional si sigues sin billing:** espera de verdad 45-60
segundos aquí antes de pedir el PDF, para liberar la ventana de cuota del
minuto anterior. Puedes cortar este tiempo en la edición, o llenarlo hablando
a cámara sobre la arquitectura:

> "Por dentro esto combina tres piezas: un LLM que razona y conversa, una base de datos DuckDB con el catálogo real de productos, y una búsqueda semántica sobre las fichas técnicas para respaldar cada recomendación con evidencia documental."

---

## 2:15 – 2:50 — Cierre con el output final (PDF)

**Escribe:**
```
Genial, genera la cotización en PDF
```

**Decir mientras se genera:**
> "Y esto es lo que un cliente real se lleva: una cotización descargable, con el desglose completo, que un asesor podría entregar en el momento en vez de tardarse horas armándola a mano."

**Acción:** Descarga y muestra el PDF 2-3 segundos (desglose + logo visibles).

**Respaldo:** si el PDF en vivo falla o tarda demasiado, ten una cotización
ya generada de antes (mismo caso) lista para mostrar como si fuera la que
acabas de pedir — es el mismo output, solo evitas depender del momento exacto.

---

## 2:50 – 3:30 — Cierre de negocio

**Decir:**
> "En resumen: esto no es un chatbot que responde preguntas genéricas de pisos. Es un agente que combina un LLM para razonar y conversar, con una base de datos real del catálogo, reglas de compatibilidad de la industria, y búsqueda semántica sobre fichas técnicas — para que cada recomendación esté respaldada por datos, no por lo que el modelo 'cree' que es verdad. Eso es lo que se necesita para llevar IA conversacional a un caso de uso donde los errores cuestan dinero real."

---

## Plan B — si la cuota está muy ajustada el día de la grabación

Reduce todo a ~1:30 min: Apertura (0:20) → Mensaje único (0:40) → Trace
(0:30) → Cierre de negocio (0:30). Salta el PDF en vivo; muéstralo como
captura de pantalla fija mientras hablas del output, en vez de generarlo
en cámara.

## Checklist final antes de dar "record"

- [ ] (Ideal) Billing habilitado en Google Cloud → riesgo de 429 casi nulo
- [ ] Si no hay billing: leído el protocolo de reintento arriba, cronómetro listo
- [ ] App abierta y responde (probado con un mensaje simple, no el de la demo)
- [ ] "No molestar" activado en Windows
- [ ] Cotización de respaldo generada por si el PDF en vivo falla
