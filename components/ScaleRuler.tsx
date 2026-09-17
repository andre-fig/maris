import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

type ScaleDefinition = {
  segmentMetres: number;
  segments: number;
  unit: 'm' | 'km';
};

type ScaleRulerProps = {
  latitude: number;
  maxWidth: number;
  visible: boolean;
  zoom: number;
};

const METRES_PER_PIXEL_AT_EQUATOR = 156543.03392;
const MAX_SCALE_METRES = 1_500_000;
const MAX_VISIBLE_SCALE_METRES = 1_000_000;
const MIN_ACTIVATION_RATIO = 1.2;
const FADE_OUT_DURATION_MS = 400;

const METRE_SCALES: ScaleDefinition[] = [
  { segmentMetres: 2, segments: 3, unit: 'm' },
  { segmentMetres: 5, segments: 2, unit: 'm' },
  { segmentMetres: 5, segments: 3, unit: 'm' },
  { segmentMetres: 12, segments: 1, unit: 'm' },
  { segmentMetres: 12, segments: 2, unit: 'm' },
  { segmentMetres: 12, segments: 3, unit: 'm' },
  { segmentMetres: 25, segments: 2, unit: 'm' },
  { segmentMetres: 25, segments: 3, unit: 'm' },
  { segmentMetres: 50, segments: 2, unit: 'm' },
  { segmentMetres: 50, segments: 3, unit: 'm' },
  { segmentMetres: 125, segments: 1, unit: 'm' },
  { segmentMetres: 125, segments: 2, unit: 'm' },
  { segmentMetres: 125, segments: 3, unit: 'm' },
  { segmentMetres: 250, segments: 2, unit: 'm' },
  { segmentMetres: 250, segments: 3, unit: 'm' },
  { segmentMetres: 500, segments: 2, unit: 'm' },
  { segmentMetres: 500, segments: 3, unit: 'm' },
];

const KILOMETRE_SCALES: ScaleDefinition[] = [1, 10, 100].flatMap(
  (multiplier) => [
    { segmentMetres: 1_250 * multiplier, segments: 1, unit: 'km' as const },
    { segmentMetres: 1_250 * multiplier, segments: 2, unit: 'km' as const },
    { segmentMetres: 1_250 * multiplier, segments: 3, unit: 'km' as const },
    { segmentMetres: 2_500 * multiplier, segments: 2, unit: 'km' as const },
    { segmentMetres: 2_500 * multiplier, segments: 3, unit: 'km' as const },
    ...(multiplier === 100
      ? [{ segmentMetres: 5_000 * multiplier, segments: 1, unit: 'km' as const }]
      : []),
    { segmentMetres: 5_000 * multiplier, segments: 2, unit: 'km' as const },
    { segmentMetres: 5_000 * multiplier, segments: 3, unit: 'km' as const },
  ],
);

const SCALES = [...METRE_SCALES, ...KILOMETRE_SCALES]
  .filter(({ segmentMetres, segments }) => segmentMetres * segments <= MAX_SCALE_METRES);

const LAST_VISIBLE_SCALE = [...SCALES]
  .reverse()
  .find(
    ({ segmentMetres, segments }) =>
      segmentMetres * segments <= MAX_VISIBLE_SCALE_METRES,
  ) ?? SCALES[0];

const SCALE_STEPS = SCALES.reduce<
  Array<{ activationMetres: number; scale: ScaleDefinition }>
>((steps, scale) => {
  const totalMetres = scale.segmentMetres * scale.segments;
  const previousActivation = steps.at(-1)?.activationMetres ?? 0;

  steps.push({
    activationMetres: Math.max(
      totalMetres,
      previousActivation * MIN_ACTIVATION_RATIO,
    ),
    scale,
  });

  return steps;
}, []);

const numberFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
});

function selectScale(maxMetres: number) {
  return (
    [...SCALE_STEPS]
      .reverse()
      .find(({ activationMetres }) => activationMetres <= maxMetres)?.scale ??
    SCALE_STEPS[0].scale
  );
}

function formatValue(valueMetres: number, unit: ScaleDefinition['unit']) {
  const value = unit === 'km' ? valueMetres / 1_000 : valueMetres;
  return numberFormatter.format(value);
}

export function ScaleRuler({ latitude, maxWidth, visible, zoom }: ScaleRulerProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const { hidden, labels, segments, width } = useMemo(() => {
    const metresPerPoint =
      (METRES_PER_PIXEL_AT_EQUATOR * Math.cos((latitude * Math.PI) / 180)) /
      2 ** zoom;
    const selectedScale = selectScale(metresPerPoint * maxWidth);
    const selectedTotalMetres =
      selectedScale.segmentMetres * selectedScale.segments;
    const hidden = selectedTotalMetres > MAX_VISIBLE_SCALE_METRES;
    const scale = hidden ? LAST_VISIBLE_SCALE : selectedScale;
    const totalMetres = scale.segmentMetres * scale.segments;
    const values = Array.from(
      { length: scale.segments + 1 },
      (_, index) => index * scale.segmentMetres,
    );

    return {
      hidden,
      labels: values.map((value, index) => {
        const formatted = formatValue(value, scale.unit);
        return index === values.length - 1 ? `${formatted} ${scale.unit}` : formatted;
      }),
      segments: scale.segments,
      width: Math.min(maxWidth, totalMetres / metresPerPoint),
    };
  }, [latitude, maxWidth, zoom]);
  const showImmediately = visible && !hidden;

  useEffect(() => {
    opacity.stopAnimation();

    if (!showImmediately) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_OUT_DURATION_MS,
        useNativeDriver: true,
      }).start();
      return;
    }

    opacity.setValue(1);
  }, [opacity, showImmediately]);

  return (
    <Animated.View
      style={[styles.panel, { opacity: showImmediately ? 1 : opacity }]}
    >
      <View style={[styles.ruler, { width }]}>
        <View style={styles.labels}>
          {labels.map((label) => (
            <View key={label}>
              <Text style={[styles.label, styles.labelOutline]}>{label}</Text>
              <Text style={styles.label}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.bar}>
          {Array.from({ length: segments }, (_, index) => (
            <View
              key={index}
              style={[
                styles.segment,
                index % 2 === 0 ? styles.segmentLight : styles.segmentDark,
              ]}
            />
          ))}
          {Array.from({ length: segments - 1 }, (_, index) => (
            <View
              key={`divider-${index}`}
              style={[
                styles.segmentDivider,
                { left: `${((index + 1) / segments) * 100}%` },
              ]}
            />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: 2,
  },
  ruler: {
    height: 26,
  },
  labels: {
    height: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  label: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  labelOutline: {
    position: 'absolute',
    color: '#000000',
    textShadowColor: '#000000',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2.5,
  },
  bar: {
    height: 7,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: '#7fa9a1',
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 3.5,
  },
  segment: {
    flex: 1,
  },
  segmentLight: {
    backgroundColor: '#7fa9a1',
  },
  segmentDark: {
    backgroundColor: '#28403e',
  },
  segmentDivider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#000000',
  },
});
