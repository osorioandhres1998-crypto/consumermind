# Módulo: Audience Research (JTBD) — guía + spec

> Cuarto módulo del motor de ConsumerMind. Sigue la **misma lógica de capas** que
> `prompts.js`: capa de conocimiento (compartida y cacheable) + capa de TASK +
> capa de entrada. Convierte el prompt de "investigación de mercado / audiencia"
> en una TASK registrable, sin lógica nueva fuera del registro `TASKS`.

---

## 1. Por qué encaja en la arquitectura actual

El motor ya resuelve "dado un producto + un cliente, razona psicológicamente y
devuelve JSON". Este módulo usa exactamente ese contrato, pero cambia la **lente**:
en vez de rankear sesgos (`bias_analysis`) o generar copy (`copy_generation`),
**modela la demanda**: cuándo, por qué y cómo busca el cliente una solución como la
tuya, usando el framework **Jobs-to-be-Done (JTBD)** y la minería de insights.

| Capa | Qué aporta este módulo |
|------|------------------------|
| Conocimiento (compartida) | Reutiliza el mismo `renderKnowledgeBase()`. No se toca. |
| TASK (nueva) | `audience_research`: rol de investigador de mercado + schema de tabla comparativa. |
| Entrada | Mismos campos (`product`, `customer`, `price`, `channel`) **+ dos nuevos opcionales**: `audience_hint` e `insights_raw`. |

Regla de oro del proyecto respetada: **añadir un módulo = registrar una TASK**.
No requiere tocar `claude-client.js`, middleware ni DB (se persiste en `analyses`
con `module='audience_research'`, igual que Copy Studio).

---

## 2. La lógica del prompt original, traducida a la app

El prompt pide tres bloques de razonamiento y un **formato de tabla** para comparar.
Se mapean así:

1. **Situaciones clave** → en qué situaciones, qué eventos/disparadores y en qué
   momento (día/semana/mes) la audiencia es más receptiva.
2. **Jobs-to-be-Done** → trabajo funcional, emocional y social de cada segmento.
3. **Insights clave** → preguntas de ventas, fricciones de soporte, social listening
   (Reddit/X/foros) y motivaciones de entrevistas.

La salida es un **array de filas** (una por segmento/situación) para que el frontend
lo pinte como tabla comparativa — el equivalente JSON de "lo quiero en una tabla".

### Flujo de entrevista previo (capa de interacción)

El prompt original empieza preguntando antes de responder. En la app eso **no** vive
en el system prompt sino en el frontend/onboarding del módulo, para no romper el
contrato "una llamada → un JSON". Antes de llamar al motor, el módulo debe recoger:

1. **¿Qué producto o servicio vendes?** → `product`.
2. **¿Tienes una idea inicial de a quién te diriges?** (creador de contenido,
   empresa, nicho…) → `audience_hint` (opcional; si está vacío, el motor propone
   segmentos hipotéticos y lo marca como `hypothesis: true`).
3. **¿Tienes insights ganados** — conversaciones reales de clientes, tickets de
   soporte, hilos de redes — de donde extraer insights únicos? → `insights_raw`
   (texto libre; si existe, el motor debe basarse en él y citarlo en `evidence`,
   no inventar).

Si faltan 1 o 2, el frontend los pide; 3 es siempre opcional.

---

## 3. TASK lista para pegar en `prompts.js`

Añadir esta entrada al objeto `TASKS` (mismo formato que las existentes):

```js
  // Módulo Audience Research → modela la demanda con Jobs-to-be-Done.
  audience_research: {
    role: 'Eres un investigador de mercado experto en Jobs-to-be-Done y psicología del consumidor.',
    instructions: `Recibirás un producto/servicio y, opcionalmente, una hipótesis de
audiencia e insights reales (conversaciones de ventas, soporte o redes). Tu tarea es
modelar la DEMANDA: identifica los segmentos de audiencia y, para cada uno, las
situaciones que disparan la búsqueda de una solución como esta, sus Jobs-to-be-Done
(funcional, emocional, social) y los insights accionables.

Reglas de evidencia:
- Si recibes "INSIGHTS REALES", BÁSATE en ellos y cítalos textualmente en "evidence".
- Lo que no esté respaldado por datos márcalo como hipótesis ("evidence": "hipótesis").
- Nunca inventes citas de clientes. Si no hay datos, infiere y dilo explícitamente.
- Sé concreto a ESTE producto y ESTE segmento, no genérico.`,
    schema: `{
  "summary": "Una oración con el insight de demanda más importante",
  "segments": [
    {
      "segment": "Nombre del segmento de audiencia",
      "is_hypothesis": true,
      "trigger_situation": "En qué situación busca una solución como la tuya",
      "trigger_event": "Evento o cambio en su vida/negocio que lo motiva",
      "best_timing": "Momento del día/semana/mes en que es más receptivo",
      "job_functional": "La tarea práctica que necesita completar",
      "job_emotional": "Cómo quiere sentirse al usar la solución",
      "job_social": "Cómo desea ser percibido por los demás",
      "sales_questions": "Preguntas típicas que haría en una conversación de ventas",
      "support_frustrations": "Fricciones recurrentes que mencionaría en soporte",
      "social_listening": "Qué se dice del sector/producto en Reddit, X, foros",
      "main_pain": "Su punto de dolor principal",
      "main_desire": "Su deseo principal",
      "evidence": "Cita textual del insight real, o 'hipótesis'"
    }
  ]
}`,
    rules: 'Devuelve entre 2 y 4 segmentos. Cada fila es una columna comparable en una tabla.',
  },
```

### Capa de entrada (ampliar `buildUserMessage`)

Añadir dos campos opcionales para que el motor pueda anclarse en datos reales:

```js
  if (input.audience_hint) lines.push(`HIPÓTESIS DE AUDIENCIA: ${input.audience_hint}`);
  if (input.insights_raw)  lines.push(`INSIGHTS REALES:\n${input.insights_raw}`);
```

No requiere más cambios: `buildSystemBlocks('audience_research')` ya funciona porque
lee la TASK del registro y reutiliza la capa de conocimiento cacheada.

---

## 4. Render en frontend (tabla comparativa)

El schema devuelve `segments[]`, donde **cada objeto es una columna** y **cada clave
es una fila** de la tabla. Cabeceras sugeridas, en orden:

Situación gatillo · Evento detonante · Mejor momento · Job funcional · Job emocional ·
Job social · Preguntas de venta · Fricciones de soporte · Social listening ·
Dolor principal · Deseo principal · Evidencia.

Reutiliza el patrón de `useBiasAnalysis` / `useCopyGeneration` para el hook
(`useAudienceResearch`) y persiste con `module='audience_research'` en `analyses`.

---

## 5. Checklist de implementación

1. Registrar la TASK `audience_research` en `prompts.js` (bloque del §3).
2. Ampliar `buildUserMessage` con `audience_hint` e `insights_raw`.
3. Crear `modules/audience-research/` + ruta `api/routes/audience-research.routes.js`
   (copiar el patrón de copy-studio; persistir en `analyses`).
4. Montar la ruta en `index.js`: `app.use('/api/audience-research', requireWorkspace, audienceResearchRoutes)`.
5. Frontend: página `/audience-research`, hook `useAudienceResearch`, render de tabla.
6. Onboarding del módulo: 3 preguntas del §2 antes de la primera llamada.
