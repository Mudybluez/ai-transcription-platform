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
        let gravityPoints = [];
        let lastGravitySpawnTime = 0;

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

                // Жирное начертание скобок по площади (толщина 26px)
                const thickness = 26; 
                // Точки выстраивают ТОЛЬКО границы (border) скобок, внутри скобок абсолютно ПУСТО!
                const borderSide = i % 2 === 0 ? 1 : -1;
                const thickOffset = borderSide * (thickness / 2) + (Math.random() - 0.5) * 0.8;

                const targetSide = isBraceOutline ? (i < braceParticlesCount / 2 ? 'left' : 'right') : null;
                let homeX;
                if (isBraceOutline) {
                    if (targetSide === 'left') {
                        homeX = Math.random() * (w * 0.43);
                    } else {
                        homeX = w * 0.57 + Math.random() * (w * 0.43);
                    }
                } else {
                    homeX = Math.random() * w;
                }

                particles.push({
                    id: i,
                    x: Math.random() * w,
                    y: Math.random() * h,
                    homeX,
                    homeY: Math.random() * h,
                    vx,
                    vy,
                    size: Math.random() * 1.5 + 0.8,
                    baseColor,
                    seed: Math.random() * 100,
                    
                    isBraceOutline,
                    targetSide,
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

        const parent = canvas.closest('.hero') || canvas.parentElement;
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

            // --- Управление гравитационными точками (появляются раз в 6 секунд) ---
            if (now - lastGravitySpawnTime > 6000) {
                lastGravitySpawnTime = now;
                const gx = width * 0.2 + Math.random() * (width * 0.6);
                const gy = height * 0.2 + Math.random() * (height * 0.6);
                gravityPoints.push({
                    x: gx,
                    y: gy,
                    spawnTime: now,
                    duration: 3800,
                    maxStrength: 0.0022
                });
            }

            // Фильтруем только активные
            gravityPoints = gravityPoints.filter(gp => now - gp.spawnTime < gp.duration);

            // Отрисовка неонового пульса гравитационных точек
            gravityPoints.forEach(gp => {
                const age = now - gp.spawnTime;
                const progress = age / gp.duration;
                const intensity = Math.sin(progress * Math.PI);
                
                ctx.save();
                ctx.beginPath();
                ctx.arc(gp.x, gp.y, 10 * intensity, 0, Math.PI * 2);
                ctx.fillStyle = '#6366f1';
                ctx.globalAlpha = intensity * 0.15;
                ctx.shadowBlur = 20;
                ctx.shadowColor = '#6366f1';
                ctx.fill();
                ctx.restore();
            });

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

            // Векторное поле течений (Fluid Flow Field) для придания живой органики в idle
            const timeScale = now * 0.0006;
            const getFluidVelocity = (x, y, seed) => {
                const scale1 = 0.003;
                const scale2 = 0.01;
                
                // Октава 1: Плавные глобальные течения (крупные волны)
                const angle1 = Math.sin(y * scale1 + timeScale * 0.4) * Math.cos(x * scale1 - timeScale * 0.3) * Math.PI * 2;
                const vx1 = Math.cos(angle1) * 0.45;
                const vy1 = Math.sin(angle1) * 0.45;

                // Октава 2: Турбулентные завихрения (микро-вихри)
                const angle2 = Math.cos(x * scale2 + timeScale * 0.8 + seed) * Math.sin(y * scale2 - timeScale * 0.6) * Math.PI * 1.5;
                const vx2 = Math.cos(angle2) * 0.25;
                const vy2 = Math.sin(angle2) * 0.25;

                return {
                    x: vx1 + vx2,
                    y: vy1 + vy2
                };
            };

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
            // Увеличили отзывчивость (0.065 при нарастании, 0.03 при распаде)
            const chaseSpeed = targetWeight > smoothWeight ? 0.065 : 0.03;
            smoothWeight += (targetWeight - smoothWeight) * chaseSpeed;

            // ОТРИСОВКА И ФИЗИКА ЧАСТИЦ (ЗВЕЗД)
            ctx.save();
            ctx.globalCompositeOperation = 'screen';

            particles.forEach((p) => {
                let targetX = p.x;
                let targetY = p.y;

                // 120 фоновых звезд: мягко текут по векторному полю и мерцают
                if (!p.isBraceOutline) {
                    p.xVelocity = p.xVelocity || (Math.random() - 0.5) * 0.2;
                    p.yVelocity = p.yVelocity || (Math.random() - 0.5) * 0.2;

                    const flow = getFluidVelocity(p.x, p.y, p.seed);

                    let gravityPullX = 0;
                    let gravityPullY = 0;
                    gravityPoints.forEach(gp => {
                        const age = now - gp.spawnTime;
                        const progress = age / gp.duration;
                        const intensity = Math.sin(progress * Math.PI);
                        
                        const dx = gp.x - p.x;
                        const dy = gp.y - p.y;
                        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                        
                        const force = (gp.maxStrength * intensity) / (dist + 50);
                        gravityPullX += dx * force;
                        gravityPullY += dy * force;
                    });

                    const damping = 0.95;
                    p.xVelocity = p.xVelocity * damping + flow.x * 0.08 + gravityPullX;
                    p.yVelocity = p.yVelocity * damping + flow.y * 0.08 + gravityPullY;

                    // Container collision bounce for background particles
                    if (p.x >= rx && p.x <= rx + tw && p.y >= ry && p.y <= ry + th) {
                        p.xVelocity *= -1;
                        p.yVelocity *= -1;
                        
                        const distLeft = p.x - rx;
                        const distRight = (rx + tw) - p.x;
                        const distTop = p.y - ry;
                        const distBottom = (ry + th) - p.y;
                        
                        const minDist = Math.min(distLeft, distRight, distTop, distBottom);
                        if (minDist === distLeft) p.x = rx - 2;
                        else if (minDist === distRight) p.x = rx + tw + 2;
                        else if (minDist === distTop) p.y = ry - 2;
                        else p.y = ry + th + 2;
                    }

                    // Velocity clamping
                    const maxSpeed = 2.0;
                    const speed = Math.sqrt(p.xVelocity * p.xVelocity + p.yVelocity * p.yVelocity);
                    if (speed > maxSpeed) {
                        p.xVelocity = (p.xVelocity / speed) * maxSpeed;
                        p.yVelocity = (p.yVelocity / speed) * maxSpeed;
                    }

                    p.x += p.xVelocity;
                    p.y += p.yVelocity;

                    // Мягкая коррекция у краев экрана (padding 25px) для предотвращения залипания
                    const padding = 25;
                    if (p.x < padding) p.x += 0.8;
                    else if (p.x > width - padding) p.x -= 0.8;
                    if (p.y < padding) p.y += 0.8;
                    else if (p.y > height - padding) p.y -= 0.8;

                    // Мягкие отскоки от границ
                    if (p.x < 0) { p.x = 0; p.xVelocity *= -0.7; }
                    if (p.x > width) { p.x = width; p.xVelocity *= -0.7; }
                    if (p.y < 0) { p.y = 0; p.yVelocity *= -0.7; }
                    if (p.y > height) { p.y = height; p.yVelocity *= -0.7; }

                    const twinkle = 0.12 + Math.sin(now * 0.0018 + p.seed) * 0.08;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fillStyle = p.baseColor;
                    ctx.globalAlpha = twinkle;
                    ctx.fill();
                    return;
                }

                // 180 контурных звезд скобок:
                // 1. Медленно обновляем координаты их домашней позиции вдоль течения жидкости
                const homeFlow = getFluidVelocity(p.homeX, p.homeY, p.seed);
                p.homeX += homeFlow.x * 0.7;
                p.homeY += homeFlow.y * 0.7;

                // Мягкие отскоки домашней позиции от соответствующих половин экрана
                const minHomeX = p.targetSide === 'left' ? 0 : width * 0.57;
                const maxHomeX = p.targetSide === 'left' ? width * 0.43 : width;

                if (p.homeX < minHomeX) { p.homeX = minHomeX; p.vx *= -1; }
                if (p.homeX > maxHomeX) { p.homeX = maxHomeX; p.vx *= -1; }
                if (p.homeY < 0) { p.homeY = 0; p.vy *= -1; }
                if (p.homeY > height) { p.homeY = height; p.vy *= -1; }

                // 2. Рассчитываем их целевые координаты на скобках
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

                // Точка на скобке с учетом смещения по границам (hollow bold)
                const braceX = pt.x + nx * p.thickOffset;
                const braceY = pt.y + ny * p.thickOffset;

                // 3. Индивидуальный расчет локального веса частицы с волновой задержкой
                const distanceFromCenter = Math.abs(p.curveT - 0.5);
                // Задержка от 0 до 0.45
                const delay = distanceFromCenter * 0.7 + (p.id % 5) * 0.03;
                
                let targetLocalWeight = 0;
                if (smoothWeight > 0.01) {
                    if (smoothWeight > delay) {
                        // Нормализуем формулу, чтобы вес ГАРАНТИРОВАНО доходил до 1.0!
                        const denom = Math.max(0.1, 1.0 - delay);
                        targetLocalWeight = (smoothWeight - delay) / denom;
                    }
                }

                // Ускоренная сборка для быстрого морфинга (0.09 при нарастании, 0.04 при разлете)
                const reactionSpeed = targetLocalWeight > p.localWeight ? 0.09 : 0.04;
                p.localWeight += (targetLocalWeight - p.localWeight) * reactionSpeed;

                // 4. КОНЕЧНАЯ ЦЕЛЬ - интерполяция между домашней дрейфующей позицией и скобкой!
                // Если localWeight = 0 (мышь ушла), цель полностью возвращается к homeX, homeY (звездное небо)
                targetX = p.homeX + (braceX - p.homeX) * p.localWeight;
                targetY = p.homeY + (braceY - p.homeY) * p.localWeight;

                // 5. Единая физика пружин (Spring Physics) в невесомости + жидкостное течение
                // Повышенная жесткость пружин для быстрой сборки менее чем за 1.5 секунды
                const springK = 0.024 + 0.065 * Math.pow(p.localWeight, 1.8);
                const damping = 0.82;

                // Ускорение к динамической цели
                const ax = (targetX - p.x) * springK;
                const ay = (targetY - p.y) * springK;

                // Добавляем микрошум для живой вибрации
                const vibration = 0.03 * (1 - p.localWeight);

                // Добавляем прямую силу течения жидкости в покое (убывает по мере сборки скобок)
                const pFlow = getFluidVelocity(p.x, p.y, p.seed);
                const fluidForceX = pFlow.x * 0.16 * (1 - p.localWeight);
                const fluidForceY = pFlow.y * 0.16 * (1 - p.localWeight);

                p.xVelocity = p.xVelocity || 0;
                p.yVelocity = p.yVelocity || 0;

                // Gentle gravity pull for contour particles in idle
                let gravityPullX = 0;
                let gravityPullY = 0;
                gravityPoints.forEach(gp => {
                    const age = now - gp.spawnTime;
                    const progress = age / gp.duration;
                    const intensity = Math.sin(progress * Math.PI);
                    
                    const dx = gp.x - p.x;
                    const dy = gp.y - p.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    
                    const force = (gp.maxStrength * intensity) / (dist + 50);
                    gravityPullX += dx * force;
                    gravityPullY += dy * force;
                });
                
                // Scale gravity pull by (1 - p.localWeight) so it only acts in idle
                gravityPullX *= (1 - p.localWeight);
                gravityPullY *= (1 - p.localWeight);

                p.xVelocity = p.xVelocity * damping + ax + fluidForceX + gravityPullX + (Math.random() - 0.5) * vibration;
                p.yVelocity = p.yVelocity * damping + ay + fluidForceY + gravityPullY + (Math.random() - 0.5) * vibration;

                // Жидкостная амортизация/отталкивание от краев контейнера (padding 35px) в покое
                const padding = 35;
                if (p.x < padding) {
                    p.xVelocity += (padding - p.x) * 0.04 * (1 - p.localWeight);
                } else if (p.x > width - padding) {
                    p.xVelocity -= (p.x - (width - padding)) * 0.04 * (1 - p.localWeight);
                }
                if (p.y < padding) {
                    p.yVelocity += (padding - p.y) * 0.04 * (1 - p.localWeight);
                } else if (p.y > height - padding) {
                    p.yVelocity -= (p.y - (height - padding)) * 0.04 * (1 - p.localWeight);
                }

                // Container collision bounce for contour particles in idle
                if (p.localWeight < 0.15) {
                    if (p.x >= rx && p.x <= rx + tw && p.y >= ry && p.y <= ry + th) {
                        p.xVelocity *= -1;
                        p.yVelocity *= -1;
                        
                        // Push out of container to prevent getting stuck
                        const distLeft = p.x - rx;
                        const distRight = (rx + tw) - p.x;
                        const distTop = p.y - ry;
                        const distBottom = (ry + th) - p.y;
                        
                        const minDist = Math.min(distLeft, distRight, distTop, distBottom);
                        if (minDist === distLeft) p.x = rx - 2;
                        else if (minDist === distRight) p.x = rx + tw + 2;
                        else if (minDist === distTop) p.y = ry - 2;
                        else p.y = ry + th + 2;
                    }
                }

                // Ограничение максимальной скорости (velocity clamping) для идеальной стабильности
                const maxSpeed = 3.5;
                const speed = Math.sqrt(p.xVelocity * p.xVelocity + p.yVelocity * p.yVelocity);
                if (speed > maxSpeed) {
                    p.xVelocity = (p.xVelocity / speed) * maxSpeed;
                    p.yVelocity = (p.yVelocity / speed) * maxSpeed;
                }

                p.x += p.xVelocity;
                p.y += p.yVelocity;

                // Мягкие отскоки от границ экрана с гашением скорости для предотвращения мерцания и разгонов
                if (p.x < 0) { p.x = 0; p.xVelocity *= -0.7; }
                if (p.x > width) { p.x = width; p.xVelocity *= -0.7; }
                if (p.y < 0) { p.y = 0; p.yVelocity *= -0.7; }
                if (p.y > height) { p.y = height; p.yVelocity *= -0.7; }

                // 6. Отрисовка созвездий: всегда отображают свои уникальные неоновые blend-цвета
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
