# Guion de pruebas — cobertura de las 13 tools

Objetivo: conversar con el agente (Streamlit `localhost:8501` o el chat web `localhost:3000`)
siguiendo estos mensajes, en orden, para que en el panel "Herramientas usadas" / TracePanel
se vean **las 13 tools** disparadas al menos una vez, incluyendo casos límite (dato faltante,
incompatibilidad, presupuesto excedido).

Productos reales usados como referencia (ya verificados en la base):
- Piso: **SKU 555332501** — Piso Soria Gris Caras Diferenciadas 55.2x55.2, $59.878 COP, interior, sin `m2_por_caja` en catálogo (fuerza "requiere revisión").
- Pegante: **SKU 901061501**, $23.900 COP.
- Boquilla: **SKU 993051511**, junta 1-5mm, $15.700 COP.

No hace falta decir los SKUs tal cual — el agente los encuentra por búsqueda; se listan aquí
solo para que sepas qué esperar en las respuestas.

---

## 1. `calcular_area`
> "Quiero enchapar una sala de 5 metros de largo por 4 de ancho, ¿cuántos m² necesito con el desperdicio normal?"

Dispara: `calcular_area`.

## 2. `buscar_revestimientos`
> "Muéstrame pisos para interior, acabado brillante, estilo marmolizado, en tono gris."

Dispara: `buscar_revestimientos`.

## 3. `get_producto`
> "Del piso Soria Gris que me mostraste, dame toda la ficha: precio, formato, acabado y disponibilidad."

Dispara: `get_producto`.

## 4. `calcular_cajas` (caso "requiere revisión" — el catálogo no trae m²/caja)
> "Con esos 20.8 m² con desperdicio, ¿cuántas cajas del Soria Gris necesito?"

Dispara: `calcular_cajas`. Como el producto no trae `m2_por_caja`, el agente debería avisar
que necesita revisar la ficha técnica — lo que a su vez debería llevarlo a usar `buscar_evidencia`.

## 5. `buscar_evidencia`
> "Búscame en la ficha técnica del Soria Gris cuántos m² trae cada caja."

Dispara: `buscar_evidencia` (RAG semántico/Chroma). Si el agente no lo hizo solo en el paso
anterior, este mensaje lo fuerza explícitamente.

## 6. `buscar_pegantes`
> "¿Qué pegante me recomiendas para instalar ese piso cerámico?"

Dispara: `buscar_pegantes`.

## 7. `calcular_pegante`
> "¿Cuántos kilos y bultos de ese pegante necesito para los 20.8 m²?"

Dispara: `calcular_pegante`.

## 8. `buscar_boquillas`
> "Necesito una boquilla para junta de 3 milímetros, en interior."

Dispara: `buscar_boquillas`.

## 9. `calcular_boquilla`
> "¿Cuánta boquilla de esa necesito para los mismos 20.8 m², con junta de 3mm?"

Dispara: `calcular_boquilla`.

## 10. `validar_compatibilidad` — caso compatible
> "¿Esa combinación de piso, pegante y boquilla es compatible para una sala interior de tráfico medio, sin humedad?"

Dispara: `validar_compatibilidad` → debería devolver **Compatible**.

## 10b. `validar_compatibilidad` — caso INCOMPATIBLE (opcional, para ver el otro veredicto)
> "¿Y si quiero instalar ese mismo piso en una terraza exterior con alto tráfico y junta de 15mm, sigue siendo compatible?"

Mismo tool, pero fuerza un veredicto **Incompatible** o **Requiere revisión** (el piso es de
interior, y 15mm probablemente excede el rango de junta de esa boquilla) — útil para ver el
otro lado del semáforo de compatibilidad en el trace.

## 11. `calcular_presupuesto` — caso dentro Y caso excedido
> "Mi presupuesto total es de 1.500.000 pesos. Súmame el costo del piso, el pegante y la boquilla y dime si alcanza."

Dispara: `calcular_presupuesto`. Con los precios reales (piso ~$60k/caja x varias cajas + pegante + boquilla) es probable que **exceda** el presupuesto de 1.5M — así ves el caso "no alcanza". Si quieres forzar el caso contrario (si da compatible con el presupuesto), sube el número:
> "Mejor con 3.000.000 de presupuesto, ¿alcanza?"

## 12. `generar_cotizacion_pdf`
> "Perfecto, genérame la cotización en PDF con estos productos, a nombre de Juan Barbier, incluye los links."

Dispara: `generar_cotizacion_pdf`. Debe aparecer el botón de descarga en la UI.

## 13. `consultar_contexto_institucional`
> "Aparte de esto, ¿desde qué año existe Corona y qué otras marcas tiene el grupo? Y de paso, ¿ustedes venden sanitarios o grifería? Si no, ¿dónde los puedo ver?"

Dispara: `consultar_contexto_institucional` (probablemente sin `seccion` o con `info_general` +
`categorias_fuera_de_catalogo` en dos llamadas, ya que la pregunta mezcla ambas).

---

## Checklist rápido durante la demo

Marca en el panel de trace (Streamlit: expander "🔧 Herramientas usadas"; Web: TracePanel) qué
tools ya viste aparecer:

- [ ] calcular_area
- [ ] buscar_revestimientos
- [ ] get_producto
- [ ] calcular_cajas (con requiere_revision=true)
- [ ] buscar_evidencia
- [ ] buscar_pegantes
- [ ] calcular_pegante
- [ ] buscar_boquillas
- [ ] calcular_boquilla
- [ ] validar_compatibilidad (compatible)
- [ ] validar_compatibilidad (incompatible / requiere revisión)
- [ ] calcular_presupuesto (excede) / (alcanza)
- [ ] generar_cotizacion_pdf
- [ ] consultar_contexto_institucional

## Notas

- El orden de los mensajes está pensado para que cada pregunta dependa naturalmente de la
  respuesta anterior (como lo haría un cliente real), no como una lista aislada de comandos.
- Si el agente resuelve dos tools en un mismo turno (p. ej. `buscar_revestimientos` +
  `get_producto` juntos), es normal — el objetivo es la cobertura total, no una tool por mensaje.
- Recuerda el riesgo de rate-limit del free tier de Gemini (ver `docs/guion_demo_corona.md`):
  si vas a grabar, deja 2-3 segundos entre mensajes.
- Los SKUs/precios reales pueden variar si el catálogo se reingesta; si alguna búsqueda no
  trae el "Soria Gris", pide simplemente "un piso gris marmolizado brillante para interior" y
  usa el primer resultado real que te muestre — la cobertura de tools no depende del SKU exacto.
