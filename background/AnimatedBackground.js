document.addEventListener('DOMContentLoaded', function () {
  const colors = [
      "#3b82f6", "#a855f7", "#6366f1", "#ec4899", "#84cc16",
      "#f59e0b", "#ef4444", "#14b8a6", "#bef264", "#6d28d9"
  ];

  const imgBaseUrl = 'https://arweave.net/NZ4oRsWSwdO0d6X6uf62phxbbMmwf9mzV3xHYO5dDBA/';
  const imgCount = 1984;

  const getRandomColor = () => colors[Math.floor(Math.random() * colors.length)];
  const getRandomImage = () => `${imgBaseUrl}${Math.floor(Math.random() * imgCount)}.png`;
  const getRandomZIndex = () => Math.floor(Math.random() * 10);
  const getRandomSize = () => Math.floor(Math.random() * 100) + 20; // Random size between 20px and 120px

  const getRandomBackground = () => {
      if (Math.random() < 1 / 3) {
          return {
              backgroundImage: `url(${getRandomImage()})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundColor: 'transparent',
          };
      } else {
          return {
              backgroundColor: getRandomColor(),
              backgroundImage: 'none',
          };
      }
  };

  const createCircles = (count, className) => {
      const container = document.getElementById('circles-container');
      for (let i = 0; i < count; i++) {
          const circle = document.createElement('li');
          const backgroundStyle = getRandomBackground();
          const size = getRandomSize();
          circle.classList.add(className);
          Object.assign(circle.style, {
              ...backgroundStyle,
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

  createCircles(10, 'static-circle'); // Create 10 static circles
  createCircles(20, 'moving-circle'); // Create 20 moving circles
});
