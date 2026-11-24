'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';

const DEFAULT_ROLLER_TRANSITION = {
  stiffness: 220,
  damping: 24,
  mass: 0.5,
};

const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

function SlidingNumberDisplay({ position, number }) {
  const transform = useTransform(position, (latest) => {
    const current = ((latest % 10) + 10) % 10;
    let offset = (10 + number - current) % 10;
    if (offset > 5) offset -= 10;
    return `translateY(${offset * 100}%)`;
  });

  return (
    <motion.span
      data-slot="sliding-number-display"
      style={{
        transform,
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
      }}
    >
      {number}
    </motion.span>
  );
}

function SlidingNumberRoller({ targetDigit, initialDigit = 0, reduce, transition }) {
  const [start] = useState(() => (initialDigit !== undefined ? initialDigit : targetDigit));
  const position = useSpring(start, transition);

  useEffect(() => {
    if (reduce) {
      position.jump(targetDigit);
    } else {
      position.set(targetDigit);
    }
  }, [targetDigit, reduce, position]);

  return (
    <span
      aria-hidden="true"
      data-slot="sliding-number-roller"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '1ch',
        height: '1.3em',
        overflow: 'hidden',
        lineHeight: '1.3em',
        verticalAlign: 'middle',
        fontVariantNumeric: 'tabular-nums',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
        maskImage:
          'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
      }}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <SlidingNumberDisplay key={i} position={position} number={i} />
      ))}
    </span>
  );
}

function formatNumber(value, { decimals, decimalSeparator, thousandSeparator, padLength }) {
  const fixed = Math.abs(value).toFixed(decimals);
  const sign = value < 0 && Number(fixed) !== 0 ? '-' : '';
  const [intPart = '0', fracPart] = fixed.split('.');
  let int = intPart.padStart(padLength, '0');
  if (thousandSeparator !== undefined) {
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator);
  }
  return fracPart ? `${sign}${int}${decimalSeparator}${fracPart}` : `${sign}${int}`;
}

export function SlidingNumber({
  number = 0,
  fromNumber,
  onNumberChange,
  inView = false,
  inViewMargin = '0px',
  inViewOnce = true,
  padStart = false,
  decimalSeparator = '.',
  decimalPlaces = 0,
  thousandSeparator,
  transition: transitionProp,
  delay = 0,
  initiallyStable = false,
  className = '',
  style,
  ...props
}) {
  const domRef = useRef(null);
  const [isInView, setIsInView] = useState(!inView);
  const reduce = useReducedMotion();

  const transition = transitionProp ?? DEFAULT_ROLLER_TRANSITION;

  useEffect(() => {
    if (!inView) {
      setIsInView(true);
      return;
    }
    const el = domRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          if (inViewOnce) observer.disconnect();
        } else if (!inViewOnce) {
          setIsInView(false);
        }
      },
      { rootMargin: inViewMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, inViewMargin, inViewOnce]);

  const decimals = decimalPlaces;
  const factor = Math.pow(10, decimals);

  const prevNumberRef = useRef(initiallyStable ? number : (fromNumber ?? number));
  const [currentNum, setCurrentNum] = useState(() => (initiallyStable ? number : (fromNumber ?? number)));

  useEffect(() => {
    if (!isInView) return;
    const t = setTimeout(() => {
      setCurrentNum(number);
      onNumberChange?.(number);
    }, reduce ? 0 : delay);
    return () => clearTimeout(t);
  }, [number, isInView, delay, reduce, onNumberChange]);

  const activeValue = isInView ? currentNum : 0;
  const prevValue = prevNumberRef.current;

  useEffect(() => {
    prevNumberRef.current = activeValue;
  }, [activeValue]);

  const absNum = Math.abs(activeValue);
  const fixed = absNum.toFixed(decimals);
  const [intStr = '0', fracStr = ''] = fixed.split('.');
  const negative = activeValue < 0 && Number(fixed) !== 0;

  const shownIntLength = padStart
    ? Math.max(Math.floor(absNum).toString().length, intStr.length)
    : intStr.length;

  const paddedIntStr = intStr.padStart(shownIntLength, '0');

  // Calculate previous int string for initial spring target
  const prevAbs = Math.abs(prevValue);
  const prevFixed = prevAbs.toFixed(decimals);
  const [prevIntStr = '0'] = prevFixed.split('.');
  const paddedPrevIntStr = prevIntStr.padStart(shownIntLength, '0');

  const intDigits = Array.from(paddedIntStr);

  return (
    <motion.span
      ref={domRef}
      data-slot="sliding-number"
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1,
        ...style,
      }}
      {...props}
    >
      <span className="sr-only" style={VISUALLY_HIDDEN}>
        {formatNumber(activeValue, {
          decimals,
          decimalSeparator,
          thousandSeparator,
          padLength: padStart ? shownIntLength : 0,
        })}
      </span>

      {negative && (
        <span aria-hidden="true" style={{ marginRight: '0.2rem' }}>
          -
        </span>
      )}

      {intDigits.map((digitChar, idx) => {
        const place = Math.pow(10, intDigits.length - idx - 1);
        const targetDigit = parseInt(digitChar, 10);
        const prevDigitChar = paddedPrevIntStr[idx];
        const initialDigit = prevDigitChar !== undefined ? parseInt(prevDigitChar, 10) : 0;

        const digitsToRight = intDigits.length - idx - 1;
        const isSeparatorPosition =
          thousandSeparator !== undefined &&
          digitsToRight > 0 &&
          digitsToRight % 3 === 0;

        return (
          <React.Fragment key={`int-pos-${place}`}>
            <motion.span
              layout="position"
              initial={{ width: 0, opacity: 0, scale: 0.8 }}
              animate={{ width: '1ch', opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 22 }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                verticalAlign: 'middle',
              }}
            >
              <SlidingNumberRoller
                targetDigit={targetDigit}
                initialDigit={initialDigit}
                reduce={Boolean(reduce)}
                transition={transition}
              />
            </motion.span>
            {isSeparatorPosition && (
              <motion.span
                layout="position"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 'auto', opacity: 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  verticalAlign: 'middle',
                }}
                aria-hidden="true"
              >
                {thousandSeparator}
              </motion.span>
            )}
          </React.Fragment>
        );
      })}

      {decimals > 0 && (
        <>
          <span aria-hidden="true">{decimalSeparator}</span>
          {Array.from(fracStr).map((fracChar, i) => (
            <motion.span
              key={`dec-pos-${i}`}
              layout="position"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                verticalAlign: 'middle',
              }}
            >
              <SlidingNumberRoller
                targetDigit={parseInt(fracChar, 10)}
                initialDigit={parseInt(fracChar, 10)}
                reduce={Boolean(reduce)}
                transition={transition}
              />
            </motion.span>
          ))}
        </>
      )}
    </motion.span>
  );
}

export default SlidingNumber;
