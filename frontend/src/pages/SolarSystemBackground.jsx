import React, { useEffect, useRef } from 'react';

const SolarSystemBackground = ({ history = [] }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let animationFrameId;

        let width = window.innerWidth;
        let height = window.innerHeight;

        // Настройка размеров под экран (ограничение DPR до 1.0 для исключения просадок FPS на Retina/4K дисплеях)
        const resizeCanvas = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            const dpr = Math.min(1.0, window.devicePixelRatio || 1);
            canvas.width = Math.ceil(width * dpr);
            canvas.height = Math.ceil(height * dpr);
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Палитра космических красок для планет
        const cosmicColors = [
            '#38bdf8', // Голубой (Cyan)
            '#34d399', // Изумрудный (Emerald)
            '#fb7185', // Нежно-розовый (Rose)
            '#fbbf24', // Янтарный (Amber)
            '#818cf8', // Индиго (Indigo)
            '#2dd4bf', // Бирюзовый (Teal)
            '#a78bfa', // Лавандовый (Purple)
            '#f472b6'  // Розовый (Pink)
        ];

        // Парсим список анализов из истории и преобразуем их в планеты
        const readyItems = history.filter(item => {
            const analysis = typeof item.structured_analysis === 'string'
                ? JSON.parse(item.structured_analysis)
                : item.structured_analysis;
            return !!analysis;
        });

        // Создаем массив планет
        let planets = [];

        if (readyItems.length === 0) {
            // Если анализов еще нет, создаем 3 красивые дефолтные планеты
            planets = [
                {
                    id: 'default-1',
                    orbitRadius: 160,
                    size: 8,
                    color: '#38bdf8',
                    speed: 0.003,
                    angle: Math.random() * Math.PI * 2,
                    moonsCount: 2
                },
                {
                    id: 'default-2',
                    orbitRadius: 240,
                    size: 11,
                    color: '#818cf8',
                    speed: -0.002,
                    angle: Math.random() * Math.PI * 2,
                    moonsCount: 3
                },
                {
                    id: 'default-3',
                    orbitRadius: 320,
                    size: 9,
                    color: '#34d399',
                    speed: 0.0015,
                    angle: Math.random() * Math.PI * 2,
                    moonsCount: 1
                }
            ];
        } else {
            // Динамически строим планеты по числу анализов
            planets = readyItems.map((item, index) => {
                const analysis = typeof item.structured_analysis === 'string'
                    ? JSON.parse(item.structured_analysis)
                    : item.structured_analysis;

                const topicsCount = analysis?.key_topics?.length || 0;
                // Количество лун равно числу ключевых тем в анализе
                const moonsCount = topicsCount > 0 ? topicsCount : (index % 3) + 1;
                
                // Распределяем орбиты с шагом
                const orbitRadius = 160 + index * 75;
                // Размер планеты зависит от объема информации в анализе
                const size = Math.min(15, Math.max(6, 6 + moonsCount * 0.8));
                
                // Скорость вращения падает по закону Кеплера с расстоянием от Солнца
                const direction = index % 2 === 0 ? 1 : -1;
                const speed = (0.006 / (index + 1)) * direction;

                return {
                    id: item.id || `planet-${index}`,
                    orbitRadius,
                    size,
                    color: cosmicColors[index % cosmicColors.length],
                    speed,
                    angle: Math.random() * Math.PI * 2,
                    moonsCount
                };
            });
        }

        // Генерация мерцающих звезд для глубокого космического пространства
        const stars = [];
        const starsCount = 80;
        for (let i = 0; i < starsCount; i++) {
            stars.push({
                x: Math.random(),
                y: Math.random(),
                size: Math.random() * 1.3 + 0.3,
                twinkleSpeed: 0.003 + Math.random() * 0.007,
                phase: Math.random() * Math.PI * 2
            });
        }

        // Анимационный цикл
        const render = () => {
            // Очищаем экран с легким стиранием для красивого шлейфа (motion blur)
            ctx.fillStyle = 'rgba(5, 5, 8, 0.08)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.save();
            const scaleX = canvas.width / width;
            const scaleY = canvas.height / height;
            ctx.scale(scaleX, scaleY); // Рисуем в оригинальных координатах

            // 1. Отрисовка мерцающих звезд
            stars.forEach(star => {
                star.phase += star.twinkleSpeed;
                const alpha = 0.1 + Math.abs(Math.sin(star.phase)) * 0.65;
                ctx.beginPath();
                ctx.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.fill();
            });

            // 2. Отрисовка космических туманностей (Nebulas) для глубокого красивого фона
            // Туманность 1 (Фиолетовая)
            ctx.beginPath();
            const nebula1 = ctx.createRadialGradient(
                width * 0.25,
                height * 0.35,
                0,
                width * 0.25,
                height * 0.35,
                width * 0.45
            );
            nebula1.addColorStop(0, 'rgba(168, 85, 247, 0.05)');
            nebula1.addColorStop(0.5, 'rgba(129, 140, 248, 0.015)');
            nebula1.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.arc(width * 0.25, height * 0.35, width * 0.45, 0, Math.PI * 2);
            ctx.fillStyle = nebula1;
            ctx.fill();

            // Туманность 2 (Бирюзовая)
            ctx.beginPath();
            const nebula2 = ctx.createRadialGradient(
                width * 0.75,
                height * 0.65,
                0,
                width * 0.75,
                height * 0.65,
                width * 0.45
            );
            nebula2.addColorStop(0, 'rgba(45, 212, 191, 0.035)');
            nebula2.addColorStop(0.5, 'rgba(56, 189, 248, 0.01)');
            nebula2.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.arc(width * 0.75, height * 0.65, width * 0.45, 0, Math.PI * 2);
            ctx.fillStyle = nebula2;
            ctx.fill();

            // Центр нашей системы (Солнце)
            const sunX = width / 2;
            const sunY = height / 2;

            // 3. Отрисовка Солнца (Фиолетово-розовый космический гигант с очень мягкими границами)
            ctx.beginPath();
            const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 150);
            sunGrad.addColorStop(0, '#c084fc');
            sunGrad.addColorStop(0.2, 'rgba(168, 85, 247, 0.7)');
            sunGrad.addColorStop(0.6, 'rgba(99, 102, 241, 0.25)');
            sunGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
            
            ctx.arc(sunX, sunY, 150, 0, Math.PI * 2);
            ctx.fillStyle = sunGrad;
            ctx.fill();

            // 4. Отрисовка орбит и планет со спутниками
            planets.forEach((planet) => {
                // Рисуем тонкую пунктирную орбиту планеты
                ctx.beginPath();
                ctx.arc(sunX, sunY, planet.orbitRadius, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 5]); // Пунктирный футуристичный стиль
                ctx.stroke();
                ctx.setLineDash([]); // Возвращаем обычную линию

                // Обновляем угол вращения планеты
                planet.angle += planet.speed;

                // Вычисляем координаты планеты на орбите
                const planetX = sunX + planet.orbitRadius * Math.cos(planet.angle);
                const planetY = sunY + planet.orbitRadius * Math.sin(planet.angle);

                // Рисуем свечение планеты (увеличиваем радиус свечения для мягкости)
                const glowRadius = planet.size * 5;
                ctx.beginPath();
                const planetGrad = ctx.createRadialGradient(planetX, planetY, 0, planetX, planetY, glowRadius);
                planetGrad.addColorStop(0, planet.color);
                planetGrad.addColorStop(0.3, planet.color);
                planetGrad.addColorStop(1, 'rgba(0,0,0,0)');
                
                ctx.arc(planetX, planetY, glowRadius, 0, Math.PI * 2);
                ctx.fillStyle = planetGrad;
                ctx.fill();

                // Рисуем само тело планеты в мягком стиле с полупрозрачностью
                ctx.beginPath();
                ctx.arc(planetX, planetY, planet.size, 0, Math.PI * 2);
                ctx.fillStyle = planet.color;
                ctx.globalAlpha = 0.5;
                ctx.fill();
                ctx.globalAlpha = 1.0;

                // 5. Рисуем спутники (Луны) вокруг планеты
                for (let j = 0; j < planet.moonsCount; j++) {
                    const moonOrbitRadius = planet.size + 12 + j * 6;
                    // Каждый спутник вращается со своей индивидуальной скоростью
                    const moonSpeed = 0.02 + (j * 0.005);
                    const moonAngle = planet.angle * 2.5 + (j * (Math.PI * 2 / planet.moonsCount));

                    const moonX = planetX + moonOrbitRadius * Math.cos(moonAngle);
                    const moonY = planetY + moonOrbitRadius * Math.sin(moonAngle);

                    // Рисуем орбиту спутника
                    ctx.beginPath();
                    ctx.arc(planetX, planetY, moonOrbitRadius, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
                    ctx.lineWidth = 0.5;
                    ctx.stroke();

                    // Рисуем саму луну
                    ctx.beginPath();
                    ctx.arc(moonX, moonY, 1.8, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(243, 244, 246, 0.75)'; // Мягкий светлый цвет луны
                    ctx.fill();
                }
            });

            ctx.restore(); // Восстанавливаем состояние контекста после масштабирования

            animationFrameId = requestAnimationFrame(render);
        };
        render();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, [history]);

    return (
        <div className="solar-system-container">
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
        </div>
    );
};

export default SolarSystemBackground;
