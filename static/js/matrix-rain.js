const canvas = document.createElement("canvas");
document.body.appendChild(canvas);
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const characters = "01 10 110 0110 1011 0101 1001 1111 0000";
const columns = Math.floor(canvas.width / 20);
const drops = Array(columns).fill(0);

function drawMatrixRain() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = "#00ff00";
    ctx.font = "16px monospace";
    
    drops.forEach((y, index) => {
        const text = characters[Math.floor(Math.random() * characters.length)];
        const x = index * 20;
        
        ctx.fillText(text, x, y);
        if (y > canvas.height && Math.random() > 0.975) {
            drops[index] = 0;
        }
        drops[index] += 20;
    });
}

setInterval(drawMatrixRain, 50);

window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});
