# Guion de cobertura de tools — Corona Asesor (para QA / validación técnica)

Duración total: ~2:00 min. App corriendo en http://localhost:8501 (o http://localhost:3000 si usas la versión web)

Objetivo: que **las 13 herramientas** del agente queden disparadas y visibles en el panel de
traza, con el menor número de mensajes posible. Un solo mensaje bien armado ya activa 12 de
13 tools en una sola pasada (confirmado en corrida real) — este guion aprovecha eso y solo
agrega lo mínimo necesario para cerrar lo que falta.

---

## ⚠️ Contexto real de cuota (léelo antes de correr/grabar)

Estás en el free tier de Gemini (250K tokens/minuto). El mensaje 1 por sí solo ya dispara
~12 llamadas encadenadas al modelo (una por cada paso de tool-use), así que puede acercarse
al límite por minuto incluso sola. Si vas a encadenar el mensaje 2, deja una pausa real de
30-45s entre ambos.

Dos formas de bajar el riesgo a casi cero:

1. **(Recomendado, 5 min, gratis)** Habilita billing en Google Cloud para tu proyecto:
   console.cloud.google.com/billing → vincular cuenta de facturación al proyecto de tu API
   key. No te cobra en uso bajo, pero sube MUCHO el límite de tokens/minuto.
2. **(Sin tocar nada)** Pausa real de 30-45s antes del mensaje 2, y ten paciencia si hay que
   reintentar el mensaje 1 una vez.

---

## Preparación

- [ ] Abre `http://localhost:8501` (o `:3000`) en una ventana limpia, sin otras pestañas.
- [ ] NO ensayes el mensaje 1 justo antes de la corrida real — gasta la misma cuota del
      minuto que vas a necesitar. Si ensayas, espera 2-3 minutos completos después.
- [ ] Ten el panel de "🔧 Herramientas usadas" / TracePanel visible o fácil de abrir.
- [ ] Ten a mano el checklist del final para ir marcando qué tool ya viste.

---

## 0:00 – 0:15 — Apertura

Decir (cámara en la pantalla de bienvenida):

> "Esto es Corona Asesor, un agente de IA que construimos para el AgentSprint by ReshapeX.
> Antes de mostrarles un caso de uso completo, quiero probar en vivo que las herramientas que
> tiene el agente —las 13— realmente se activan y responden con datos reales, no con
> supuestos del modelo."

---

## Mensaje 1 — dispara 12 de 13 tools de un solo golpe

Escribe exactamente:

> Hola, tengo un baño interior de 3 metros de largo por 2 metros de ancho, es zona húmeda,
> me gusta el diseño marmolizado, y mi presupuesto es de 2.000.000 de pesos. Recomiéndame el
> piso, el pegante y la boquilla, y calcula las cantidades exactas.

Nota: no hace falta pedirle explícitamente "dime si alcanza" — el cálculo de presupuesto
(`calcular_presupuesto`) ya está programado para comparar siempre el costo total contra el
presupuesto declarado y devolver si queda dentro, si excede y por cuánto. Basta con darle el
número de presupuesto en el mensaje; el resto lo hace solo.

Mientras carga (puede tardar 15-30s), lo que está pasando por dentro:

> "Con una sola indicación en lenguaje natural, el agente encadena automáticamente: cálculo
> de área, búsqueda de revestimientos, ficha del producto, evidencia en la ficha técnica
> cuando falta un dato, búsqueda y cálculo de pegante y boquilla, cálculo de presupuesto, y
> validación de compatibilidad — sin que yo le pida cada paso por separado."

**Tools que debería disparar este único mensaje** (verificado en corrida real, 12 tools):

- [ ] `calcular_area`
- [ ] `buscar_revestimientos`
- [ ] `get_producto`
- [ ] `buscar_evidencia`
- [ ] `calcular_cajas` (con `requiere_revision: true` — el catálogo no trae m²/caja de este producto)
- [ ] `buscar_pegantes`
- [ ] `buscar_boquillas`
- [ ] `calcular_pegante` (puede salir `requiere_revision` si falta el rendimiento del pegante elegido)
- [ ] `calcular_boquilla` (puede salir `requiere_revision` si faltan medidas de junta/formato)
- [ ] `calcular_presupuesto` (se dispara solo por incluir el número de presupuesto en el
  mensaje; con este caso real dio total ~$292.612, dentro de presupuesto — el agente no
  necesita que se lo pidan aparte, siempre calcula dentro/excede/sobra)
- [ ] `validar_compatibilidad` (caso Compatible — humedad alta, tráfico medio, junta dentro de rango)

Nota: en la corrida de referencia `calcular_cajas` apareció dos veces (una antes y otra
después de consultar la ficha técnica) — es normal, el agente reintenta el cálculo con el
dato nuevo que acaba de obtener.

**Lo que NO se dispara con este mensaje** (2 tools quedan pendientes): `generar_cotizacion_pdf`
y `consultar_contexto_institucional`. También queda pendiente ver el otro veredicto de
`validar_compatibilidad` (Incompatible / Requiere revisión), porque este caso salió
Compatible.

---

## Mensaje 2 — cierra el PDF (`generar_cotizacion_pdf`)

Escribe:

> Perfecto, genérame la cotización en PDF con estos productos, incluye los links.

**Chequear en la traza:** `generar_cotizacion_pdf`. Descarga y abre el PDF para confirmar
que el desglose y el logo se vean bien.

---

## Mensaje 3 — cierra contexto institucional (`consultar_contexto_institucional`)

Escribe:

> Aparte de esto, ¿desde qué año existe Corona y qué otras marcas tiene el grupo? Y de paso,
> ¿ustedes venden sanitarios o grifería? Si no, ¿dónde los puedo ver?

Esta pregunta mezcla a propósito info general de la empresa y una categoría fuera del
catálogo de este agente, para confirmar que la misma tool resuelve ambas (con o sin filtro
de `seccion`) y que el link que da es real, no inventado.

**Chequear en la traza:** `consultar_contexto_institucional`.

---

## Mensaje 4 (opcional) — el otro veredicto de compatibilidad

Solo si quieres ver también el caso Incompatible/Requiere revisión de `validar_compatibilidad`
(el mensaje 1 ya la disparó, pero en su versión Compatible):

> ¿Y si quiero instalar ese mismo piso en una terraza exterior con alto tráfico y junta de 15
> milímetros, sigue siendo compatible?

El piso es de interior y 15mm probablemente excede el rango de la boquilla — debería salir
Incompatible o Requiere revisión, con las razones explícitas listadas.

---

## Checklist final — las 13 tools

- [ ] `calcular_area` — mensaje 1
- [ ] `buscar_revestimientos` — mensaje 1
- [ ] `get_producto` — mensaje 1
- [ ] `calcular_cajas` — mensaje 1 (requiere revisión)
- [ ] `buscar_evidencia` — mensaje 1
- [ ] `buscar_pegantes` — mensaje 1
- [ ] `calcular_pegante` — mensaje 1
- [ ] `buscar_boquillas` — mensaje 1
- [ ] `calcular_boquilla` — mensaje 1
- [ ] `validar_compatibilidad` (Compatible) — mensaje 1
- [ ] `validar_compatibilidad` (Incompatible/Requiere revisión) — mensaje 4 (opcional)
- [ ] `calcular_presupuesto` — mensaje 1
- [ ] `generar_cotizacion_pdf` — mensaje 2
- [ ] `consultar_contexto_institucional` — mensaje 3

Con los mensajes 1, 2 y 3 (sin el opcional 4) ya tienes las 13 tools cubiertas en 3 mensajes
y ~2 minutos, en vez de 9 bloques y 6:30 min.

---

## Cierre (opcional, si vas a grabar esto como parte del pitch)

Decir:

> "Esto se construyó en el marco del AgentSprint by ReshapeX, y lo que acaban de ver no es
> una demo escenificada: son las 13 herramientas reales del agente, cada una consultando la
> base de datos, las fichas técnicas o las reglas de negocio de verdad. Ese es el estándar
> que nos propusimos desde el hackathon: cero respuestas inventadas."
