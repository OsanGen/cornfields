// Art and performance controls. These never change collision, cover or AI rules.
export const PRESENTATION = Object.freeze({
  field: Object.freeze({patchSize:12, plantsPerPatch:145, radius:12, nearRadius:6, wind:.045}),
  pacing: Object.freeze({recoverySeconds:8, warningDistance:18, messageGap:8}),
  quality: Object.freeze({
    low:Object.freeze({pixelRatio:.75, nearRadius:4, rain:.5}),
    balanced:Object.freeze({pixelRatio:1, nearRadius:6, rain:.75}),
    high:Object.freeze({pixelRatio:1.5, nearRadius:8, rain:1}),
  }),
});
