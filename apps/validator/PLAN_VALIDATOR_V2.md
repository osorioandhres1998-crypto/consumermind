# MVP Validator v2 — plan de acción

> Reposicionamiento aprobado: de "predice la aceptación del mercado" a
> **"evalúa la idea, cuantifica lo que no sabes y diseña cómo validarlo"**.
> El Monte Carlo se conserva, pero pasa a propagar incertidumbre real en vez
> de generar ruido uniforme sobre percepciones aleatorias.

## Diagnóstico (resumen)
- La simulación nunca lee la idea: toda la información se comprime en 3 escalares
  adivinados por el LLM; percepciones y precio son `rng.random()`.
- El IC 95% mide varianza de muestreo interno, no incertidumbre real → falsa precisión.
- Los arquetipos se promedian antes de simular → no influyen.
- Características fijas y genéricas; "importancia" es circular (devuelve los pesos).
- Objeciones: 3 etiquetas fijas, artefactos del modelo.
- Sin precio real, competencia, canal ni anclas externas. Sin calibración.
- Audience Research (JTBD) existe pero no alimenta el validator.

## Fases

### Fase 1 — Núcleo honesto
| # | Tarea | Entregable | Estado |
|---|-------|-----------|--------|
| 1.1 | **Rúbrica de evaluación con incertidumbre explícita** | `app/llm/rubric.py` (Claude + heurístico): 7 dimensiones con `score/low/high`, justificación, `is_hypothesis`; `overall` con rango, `confidence`, `key_assumptions`, `missing_info`. Inputs nuevos opcionales: `price`, `alternatives`, `channel`, `insights_raw`. Se devuelve y persiste dentro de `results.rubric`. UI: card de rúbrica + campos opcionales. Tests heurísticos. | ✅ |
| 1.2 | **Monte Carlo v2: propagación de incertidumbre + mezcla por segmento** | Muestrear por iteración los parámetros de la rúbrica de distribuciones PERT/Beta (`low/mode/high`); simular por arquetipo (mixture, sin promediar) con precio real → distribución de adopción cuyo IC refleja incertidumbre epistémica; curva precio-adopción; sensibilidad parámetro→resultado (qué duda pesa más). Reemplaza `feature_importance` circular. | ✅ |
| 1.3 | **Personas sintéticas que responden a la propuesta** | Cada arquetipo "lee" la propuesta (una llamada batched): intención 1-5, objeción textual específica, qué lo convencería. Reemplaza las 3 etiquetas fijas. Agregación ponderada por `segment_share`. | ✅ |
| 1.4 | **Estabilidad y transparencia** | Ensemble de N llamadas LLM (mediana) para estabilizar; aviso visible cuando corre el heurístico; `confidence` siempre en pantalla; retirar el gauge de "IC 95%" engañoso. | ✅ |

### Fase 2 — Anclas externas
| 2.1 | Benchmarks por vertical (`benchmarks-verticales.js` → compartir con Python) como priors del `adoption` por segmento. | ✅ |
| 2.2 | Señales de demanda reales (opcional, Bright Data): volumen de búsqueda, competidores, reseñas → `evidence` en la rúbrica. | ✅ |
| 2.3 | Conectar Audience Research (JTBD) como paso previo: segmentos → arquetipos. | ⬜ |

### Fase 3 — Cierre del ciclo
| 3.1 | Recomendador de experimentos: smoke test de landing, fake door, pre-venta, entrevistas — con métrica objetivo y umbral de éxito por experimento. | ⬜ |
| 3.2 | Enlace con Landing Analyzer y Experimentos A/B del proyecto (la landing del smoke test se audita; el resultado se registra como experimento). | ⬜ |
| 3.3 | Reposicionamiento de UI y copy: "Pre-validación de idea"; hipótesis marcadas; sin promesas de predicción. | ⬜ |

### Fase 4 — Calibración con datos del workspace
| 4.1 | Registrar resultado real (conversión del smoke test, pre-ventas) junto a la estimación → error de calibración por vertical. | ⬜ |
| 4.2 | Ajustar priors por vertical con los datos acumulados (Bayes simple). | ⬜ |

## Reglas
- Regla de oro del validator: **siempre existe fallback heurístico** (tests y CI sin red).
- La API key vive solo en backend. Nada de LLM desde el navegador.
- Cambios compatibles hacia atrás: la respuesta actual se mantiene y se **añaden** campos.
