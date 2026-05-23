import React, { useEffect, useRef } from 'react';

// Хелпер для вычисления точки на кубической кривой Безье
const getBezierPoint = (p0, p1, p2, p3, u) => {
    const term0 = (1 - u) * (1 - u) * (1 - u);
    const term1 = 3 * (1 - u) * (1 - u) * u;
    const term2 = 3 * (1 - u) * u * u;
    const term3 = u * u * u;

    return {
        x: term0 * p0.x + term1 * p1.x + term2 * p2.x + term3 * p3.x,
        y: term0 * p0.y + term1 * p1.y + term2 * p2.y + term3 * p3.y
    };
};

// Функция генерации типографически идеальной фигурной скобки с помощью сплайнов Безье
const getBracePoint = (side, t, cx, cy, braceOffset, braceHeight, hookWidth, cuspWidth) => {
    const dir = side === 'left' ? -1 : 1;
    const baseX = cx + dir * braceOffset;
    
    t = Math.max(0, Math.min(1, t));
    
    if (t < 0.25) {
        // Сегмент 1: Верхний крючок скобки (кривая от кончика к вертикальному стеблю)
        const u = t / 0.25;
        // Кончик крючка направлен внутрь к центру текста
        const p0 = { x: baseX - dir * hookWidth, y: cy - braceHeight / 2 };
        const p1 = { x: baseX - dir * hookWidth * 0.1, y: cy - braceHeight / 2 };
        const p2 = { x: baseX, y: cy - braceHeight / 2 + hookWidth * 0.1 };
        const p3 = { x: baseX, y: cy - braceHeight / 2 + hookWidth * 1.5 };
        return getBezierPoint(p0, p1, p2, p3, u);
    } else if (t < 0.5) {
        // Сегмент 2: Верхняя половина стебля и переход к среднему носику (cusp)
        const u = (t - 0.25) / 0.25;
        const p0 = { x: baseX, y: cy - braceHeight / 2 + hookWidth * 1.5 };
        const p1 = { x: baseX, y: cy - cuspWidth * 1.2 };
        const p2 = { x: baseX + dir * cuspWidth * 0.1, y: cy - cuspWidth * 0.6 };
        // Носик скобки направлен наружу от текста
        const p3 = { x: baseX + dir * cuspWidth, y: cy };
        return getBezierPoint(p0, p1, p2, p3, u);
    } else if (t < 0.75) {
        // Сегмент 3: Средний носик и переход к нижней половине стебля
        const u = (t - 0.5) / 0.25;
        const p0 = { x: baseX + dir * cuspWidth, y: cy };
        const p1 = { x: baseX + dir * cuspWidth * 0.1, y: cy + cuspWidth * 0.6 };
        const p2 = { x: baseX, y: cy + cuspWidth * 1.2 };
        const p3 = { x: baseX, y: cy + braceHeight / 2 - hookWidth * 1.5 };
        return getBezierPoint(p0, p1, p2, p3, u);
    } else {
        // Сегмент 4: Нижний крючок скобки (кривая от стебля к нижнему кончику)
        const u = (t - 0.75) / 0.25;
        const p0 = { x: baseX, y: cy + braceHeight / 2 - hookWidth * 1.5 };
        const p1 = { x: baseX, y: cy + braceHeight / 2 - hookWidth * 0.1 };
        const p2 = { x: baseX - dir * hookWidth * 0.1, y: cy + braceHeight / 2 };
        const p3 = { x: baseX - dir * hookWidth, y: cy + braceHeight / 2 };
        return getBezierPoint(p0, p1, p2, p3, u);
    }
};

const HeroParticles = () => {
    const canvasRef = useRef(null);
    const mouseRef = useRef({ x: -1000, y: -1000, active: false, distance: 1000 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let animationFrameId;

        let width = 0;
        let height = 0;
        let smoothWeight = 0; // Плавный глобальный вес для сглаженного волнового притяжения и распада

        // Настройка плотности:
        // Всего 300 звезд (больше точек для насыщенного космоса и жирного контура)
        // 60% точек (180 штук, по 90 на каждую сторону) собираются в толстые, объемные скобки { }
        // 40% точек (120 штук) свободно парят в качестве красивого фона
        const numParticles = 300;
        const braceParticlesCount = 180; 
        const particles = [];

        // 5 красивых blend-цветов (белый, голубой, фиолетовый, розовый, ярко-оранжевый)
        const particleColors = [
            '#ffffff', // Белый
            '#38bdf8', // Голубой
            '#c084fc', // Фиолетовый
            '#f472b6', // Розовый
            '#f97316'  // Ярко-оранжевый
        ];

        // Инициализируем частицы
        const initParticles = (w, h) => {
            particles.length = 0;
            for (let i = 0; i < numParticles; i++) {
                const isBraceOutline = i < braceParticlesCount;
                const baseColor = particleColors[i % particleColors.length];
                
                // Случайная начальная скорость дрейфа
                const vx = (Math.random() - 0.5) * 0.05;
                const vy = (Math.random() - 0.5) * 0.05;

                // Жирное начертание скобок по площади (толщина увеличена до 26px по просьбе пользователя)
                const thickness = 26; 
                // Точки выстраивают ТОЛЬКО границы (border) скобок, внутри скобок абсолютно ПУСТО!
                // Половина точек идет на внешнюю границу, половина на внутреннюю
                const borderSide = i % 2 === 0 ? 1 : -1;
                // Небольшое размытие около границ (+/-0.8px) для естественности, но центр остается пустым
                const thickOffset = borderSide * (thickness / 2) + (Math.random() - 0.5) * 0.8;

                particles.push({
                    id: i,
                    x: Math.random() * w,
                    y: Math.random() * h,
                    vx,
                    vy,
                    size: Math.random() * 1.5 + 0.8,
                    baseColor,
                    seed: Math.random() * 100,
                    
                    isBraceOutline,
                    targetSide: isBraceOutline ? (i < braceParticlesCount / 2 ? 'left' : 'right') : null,
                    // Распределение частиц равномерно вдоль кривой Безье (от 0 до 1)
                    curveT: isBraceOutline ? (i % (braceParticlesCount / 2)) / (braceParticlesCount / 2 - 1) : 0,
                    thickOffset,
                    localWeight: 0
                });
            }
        };

        const resizeCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.ceil(width * dpr);
            canvas.height = Math.ceil(height * dpr);
            ctx.scale(dpr, dpr);
            
            initParticles(width, height);
        };
        resizeCanvas();

        const handleMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            mouseRef.current = { x, y, active: true };
        };

        const handleMouseLeave = () => {
            mouseRef.current = { x: -1000, y: -1000, active: false };
        };

        const parent = canvas.parentElement;
        if (parent) {
            parent.addEventListener('mousemove', handleMouseMove);
            parent.addEventListener('mouseleave', handleMouseLeave);
        }
        window.addEventListener('resize', resizeCanvas);

        // Хелпер для плавного лерпа цветов
        const lerpColor = (c1, c2, w) => {
            const r1 = parseInt(c1.substring(1, 3), 16);
            const g1 = parseInt(c1.substring(3, 5), 16);
            const b1 = parseInt(c1.substring(5, 7), 16);

            const r2 = parseInt(c2.substring(1, 3), 16);
            const g2 = parseInt(c2.substring(3, 5), 16);
            const b2 = parseInt(c2.substring(5, 7), 16);

            const r = Math.round(r1 + (r2 - r1) * w);
            const g = Math.round(g1 + (g2 - g1) * w);
            const b = Math.round(b1 + (b2 - b1) * w);

            return `rgb(${r}, ${g}, ${b})`;
        };

        // Расстояние от мыши до bounding box текста
        const getDistanceToRect = (mx, my, rx, ry, rw, rh) => {
            const dx = Math.max(rx - mx, 0, mx - (rx + rw));
            const dy = Math.max(ry - my, 0, my - (ry + rh));
            return Math.sqrt(dx * dx + dy * dy);
        };

        // Анимационный цикл
        const animate = () => {
            const now = performance.now();
            ctx.clearRect(0, 0, width, height);

            const mouse = mouseRef.current;
            const cx = width / 2;
            const cy = height / 2;

            // Bounding box для текста
            const tw = Math.min(width * 0.8, 760); 
            const th = 150; 
            const rx = cx - tw / 2;
            const ry = cy - th / 2;

            let distance = 1000;
            if (mouse.active) {
                distance = getDistanceToRect(mouse.x, mouse.y, rx, ry, tw, th);
            }

            const braceOffset = Math.min(410, width * 0.44); 
            const braceHeight = Math.min(180, height * 0.75); 

            // Настройки изящных изгибов скобок
            const hookWidth = 24; 
            const cuspWidth = 26; 

            // Расчет целевого глобального веса притяжения (weight)
            const influenceRadius = 250;
            let targetWeight = 0;

            if (mouse.active) {
                if (distance === 0) {
                    targetWeight = 1.0;
                } else if (distance < influenceRadius) {
                    targetWeight = Math.pow(1 - distance / influenceRadius, 1.4);
                }
            }

            // Плавное следование глобального веса за целью (smoothWeight)
            // При сборке (нарастании) скорость 0.022, при распаде (разлете) - 0.012 (для красивой долгой задержки)
            const chaseSpeed = targetWeight > smoothWeight ? 0.022 : 0.012;
            smoothWeight += (targetWeight - smoothWeight) * chaseSpeed;

            // ОТРИСОВКА И ФИЗИКА ЧАСТИЦ (ЗВЕЗД)
            ctx.save();
            ctx.globalCompositeOperation = 'screen';

            particles.forEach((p) => {
                let targetX = p.x;
                let targetY = p.y;

                if (p.isBraceOutline) {
                    const pt = getBracePoint(
                        p.targetSide,
                        p.curveT,
                        cx,
                        cy,
                        braceOffset,
                        braceHeight,
                        hookWidth,
                        cuspWidth
                    );
                    
                    // Вычисляем нормальный вектор к кривой Безье для придания "жирности" границам скобок
                    const t1 = Math.max(0, p.curveT - 0.01);
                    const t2 = Math.min(1, p.curveT + 0.01);
                    const pt1 = getBracePoint(p.targetSide, t1, cx, cy, braceOffset, braceHeight, hookWidth, cuspWidth);
                    const pt2 = getBracePoint(p.targetSide, t2, cx, cy, braceOffset, braceHeight, hookWidth, cuspWidth);
                    
                    const dx = pt2.x - pt1.x;
                    const dy = pt2.y - pt1.y;
                    const len = Math.sqrt(dx * dx + dy * dy) || 1;
                    
                    const nx = -dy / len;
                    const ny = dx / len;

                    // Добавляем перпендикулярное смещение по границам (hollow bold контур)
                    targetX = pt.x + nx * p.thickOffset;
                    targetY = pt.y + ny * p.thickOffset;
                }

                // Индивидуальный расчет локального веса частицы с волновой задержкой
                if (p.isBraceOutline) {
                    // Задержка зависит от расстояния точки до центрального носика скобки (t = 0.5)
                    const distanceFromCenter = Math.abs(p.curveT - 0.5);
                    const delay = distanceFromCenter * 0.95 + (p.id % 6) * 0.04;
                    const targetLocalWeight = smoothWeight > 0.01 ? Math.max(0, smoothWeight - delay) : 0;

                    // Медленная и плавная сборка/разлет контура (интерполяция 0.018)
                    p.localWeight += (targetLocalWeight - p.localWeight) * 0.018;
                }

                // Физика пружин невесомости (Spring Physics) на основе локального веса сборки
                if (p.isBraceOutline && p.localWeight > 0.005) {
                    // Сила притяжения растет нелинейно по мере сборки
                    const springK = 0.038 * Math.pow(p.localWeight, 1.8);
                    const damping = 0.86; // Торможение в космосе (вязкая среда)

                    // Вычисляем ускорение к целевым координатам границ
                    const ax = (targetX - p.x) * springK;
                    const ay = (targetY - p.y) * springK;

                    // Добавляем микрошум для живой вибрации
                    const vibration = 0.03 * (1 - p.localWeight);

                    p.vx = p.vx * damping + ax + (Math.random() - 0.5) * vibration;
                    p.vy = p.vy * damping + ay + (Math.random() - 0.5) * vibration;
                } else {
                    // Режим покоя: свободный космический дрейф
                    const noiseStrength = 0.0014;
                    p.vx += (Math.random() - 0.5) * noiseStrength;
                    p.vy += (Math.random() - 0.5) * noiseStrength;

                    // Ограничение скорости величественного полета
                    const maxSpeed = p.isBraceOutline ? 0.35 : 0.06;
                    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                    if (speed > maxSpeed) {
                        p.vx = (p.vx / speed) * maxSpeed;
                        p.vy = (p.vy / speed) * maxSpeed;
                    }
                }

                p.x += p.vx;
                p.y += p.vy;

                // Упругий отскок от краев экрана
                if (p.x < 0 || p.x > width) p.vx *= -0.7;
                if (p.y < 0 || p.y > height) p.vy *= -0.7;

                // 120 фоновых звезд: парят и мерцают
                if (!p.isBraceOutline) {
                    const twinkle = 0.12 + Math.sin(now * 0.0018 + p.seed) * 0.08;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fillStyle = p.baseColor;
                    ctx.globalAlpha = twinkle;
                    ctx.fill();
                    return;
                }

                // 180 контурных звезд скобок: всегда отображают свои уникальные blend-цвета
                const particleColor = p.baseColor;
                const opacity = 0.28 + p.localWeight * 0.65;
                
                // Чуть уменьшенный размер при сборке для сохранения зазоров/пространства между звездами
                const size = p.size * (0.9 + p.localWeight * 0.35); 

                // Мягкий неоновый ореол вокруг собранных частиц
                if (p.localWeight > 0.02) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size * 2.8, 0, Math.PI * 2);
                    ctx.fillStyle = particleColor;
                    ctx.globalAlpha = p.localWeight * 0.14;
                    ctx.fill();
                    ctx.restore();
                }

                // Отрисовка объемных стеклянных звезд
                ctx.save();
                ctx.beginPath();
                ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                
                const grad = ctx.createRadialGradient(
                    p.x - size * 0.35,
                    p.y - size * 0.35,
                    size * 0.04,
                    p.x,
                    p.y,
                    size
                );
                
                grad.addColorStop(0, '#ffffff'); // Световой блик
                grad.addColorStop(0.2, particleColor); // Основной цвет звезды
                grad.addColorStop(0.85, lerpColor(particleColor, '#000000', 0.55)); // Тень на сфере
                grad.addColorStop(1, 'transparent');
                
                ctx.fillStyle = grad;
                ctx.globalAlpha = opacity;
                ctx.fill();
                ctx.restore();
            });

            ctx.restore();
            animationFrameId = requestAnimationFrame(animate);
        };
        animate();

        return () => {
            if (parent) {
                parent.removeEventListener('mousemove', handleMouseMove);
                parent.removeEventListener('mouseleave', handleMouseLeave);
            }
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 1
            }}
        />
    );
};

export default HeroParticles;
