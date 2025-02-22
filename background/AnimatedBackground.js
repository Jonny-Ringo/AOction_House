document.addEventListener('DOMContentLoaded', function () {
    const colors = [
        "#ea2085", "#b47aea", "#43bccd", "#81e41d", "#fec756",
        "#ea8220", "#ea3546"
    ];
  
    const getRandomColor = () => colors[Math.floor(Math.random() * colors.length)];
    const getRandomZIndex = () => Math.floor(Math.random() * 10);
    const getRandomSize = () => Math.floor(Math.random() * 100) + 20; // Random size between 20px and 120px
  
    const createCircles = (count, className) => {
        const container = document.getElementById('circles-container');
        for (let i = 0; i < count; i++) {
            const circle = document.createElement('li');
            const size = getRandomSize();
            circle.classList.add(className);
            Object.assign(circle.style, {
                backgroundColor: getRandomColor(),
                zIndex: getRandomZIndex(),
                width: `${size}px`,
                height: `${size}px`,
                left: `${Math.random() * 100}%`,
                borderRadius: '50%',
                top: className === 'static-circle' ? `${Math.random() * 100}%` : 'auto',
                bottom: className === 'moving-circle' ? '-150px' : 'auto',
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${Math.random() * 20 + 10}s`
            });
            container.appendChild(circle);
        }
    };
  
    createCircles(15, 'static-circle'); // Create 10 static circles
    createCircles(20, 'moving-circle'); // Create 20 moving circles
  });