/** One source for the disclaimer: the header dialog, the footer and the PDF all read from here. */
export const DISCLAIMER = [
  "Este asesor es un ejercicio académico creado para la competencia AgentSprint by ReshapeX. No es un canal oficial de Organización Corona, no está afiliado a ella ni cuenta con su respaldo.",
  "Se construyó solo con información pública: el catálogo y las fichas técnicas publicadas en corona.co, tomados como una copia fija. No se usó información privilegiada. Precios y disponibilidad pueden haber cambiado desde esa copia.",
  "Es una propuesta de mejora para un problema real: cotizar un enchape sin errores de cantidades, de compatibilidad ni de precios.",
  "La marca Corona, su logo, el catálogo, las fichas técnicas y las imágenes de producto pertenecen a Organización Corona.",
] as const;

export const DATA_USE_NOTE =
  "Los mensajes se procesan con el nivel gratuito de la API de Gemini de Google, que puede usar ese contenido para mejorar sus productos. No escribas datos personales.";

export const CREDITS =
  "Prototipo original de Daniel Garzón, Juan Miranda y Santiago Marín para AgentSprint by ReshapeX. Esta versión (arquitectura en TypeScript, agente y herramientas, protecciones, interfaz web con streaming, evaluaciones de grounding y despliegue en Vercel) es una reescritura de Santiago Marín.";

/** Short form for the footer and the PDF footer. It keeps every point the full text makes. */
export const DISCLAIMER_SHORT =
  "Ejercicio académico para AgentSprint by ReshapeX, hecho solo con información pública, como propuesta de mejora. No es un canal oficial de Organización Corona ni está afiliado a ella. La marca, el catálogo, las fichas y las imágenes son de Organización Corona.";

export const SOURCE_URL = "https://github.com/SMarinC/corona-asesor";
