import React, { useEffect, useRef } from 'react';

const SolarSystemBackground = ({ history = [] }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let animationFrameId;

        // Настройка размеров под экран
        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
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

        // Анимационный цикл
        const render = () => {
            // Очищаем экран с легким стиранием для красивого шлейфа (motion blur)
            ctx.fillStyle = 'rgba(5, 5, 8, 0.08)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Центр нашей системы (Солнце)
            const sunX = canvas.width / 2;
            const sunY = canvas.height / 2;

            // 1. Отрисовка Солнца (Фиолетово-розовый космический гигант)
            ctx.beginPath();
            const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 35);
            sunGrad.addColorStop(0, '#c084fc');
            sunGrad.addColorStop(0.3, '#a855f7');
            sunGrad.addColorStop(0.8, 'rgba(99, 102, 241, 0.15)');
            sunGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
            
            ctx.arc(sunX, sunY, 35, 0, Math.PI * 2);
            ctx.fillStyle = sunGrad;
            ctx.fill();

            // 2. Отрисовка орбит и планет со спутниками
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

                // Рисуем свечение планеты
                ctx.beginPath();
                const planetGrad = ctx.createRadialGradient(planetX, planetY, 0, planetX, planetY, planet.size * 2);
                planetGrad.addColorStop(0, planet.color);
                planetGrad.addColorStop(0.4, planet.color);
                planetGrad.addColorStop(1, 'rgba(0,0,0,0)');
                
                ctx.arc(planetX, planetY, planet.size * 2, 0, Math.PI * 2);
                ctx.fillStyle = planetGrad;
                ctx.fill();

                // Рисуем само тело планеты
                ctx.beginPath();
                ctx.arc(planetX, planetY, planet.size, 0, Math.PI * 2);
                ctx.fillStyle = planet.color;
                ctx.fill();

                // 3. Рисуем спутники (Луны) вокруг планеты
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
