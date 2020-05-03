const idealWidth = 1280;
const idealHeight = 720;
const debug = true;
const showKeypoints = true;

const stats = new Stats();

const posenetParams = {
    architecture: 'MobileNetV1',
    outputStride: 16,
    inputResolution: { width: 320, height: 160 },
    multiplier: 0.50,
    quantBytes: 2
};

navigator.getUserMedia = navigator.getUserMedia
    || navigator.webkitGetUserMedia
    || navigator.mozGetUserMedia;
window.requestAnimationFrame = window.requestAnimationFrame
    || window.mozRequestAnimationFrame
    || window.webkitRequestAnimationFrame
    || window.msRequestAnimationFrame;

function isAndroid() {
    return /Android/i.test(navigator.userAgent);
}

function isiOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isMobile() {
    return isAndroid() || isiOS();
}

function getRandomInclusive(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.random() * (max - min + 1) + min;
}

class Face {
    constructor(imgUrl) {
        this._image = new Image();
        this._image.src = imgUrl;
    }

    draw(keypoints, ctx, scale = 1) {
        let face = this._calcFacePosition(keypoints[posenet.partIds['leftEar']], keypoints[posenet.partIds['rightEar']]);
        ctx.drawImage(
            this._image,
            (face.x - face.width / 2) * scale,
            (face.y - face.width / 2) * scale,
            face.width * scale,
            face.width * scale
        );
    }

    _calcFacePosition(leftEar, rightEar) {
        let width = rightEar.position.x - leftEar.position.x;
        let x = leftEar.position.x + width / 2;
        let y = (rightEar.position.y + leftEar.position.y) / 2

        return { 'width': width * 1.2, 'x': x, 'y': y };
    }
}

class EnemyManager {
    constructor(canvasWidth, canvasHeight) {
        this._canvasWidth = canvasWidth;
        this._canvasHeight = canvasHeight;
        this._enemyWidth = Math.floor(canvasWidth / 8);
        this._enemies = new Array();
        this._nextEnemyComingTime = 1000;
        this._totalElpseTime = 0;
    }

    update(progressTimeInMillisec, rightWrist, scale) {
        this._totalElpseTime += progressTimeInMillisec;

        this._enemies.forEach(enemy => {
            enemy.update(progressTimeInMillisec, rightWrist, scale);
        });

        let newEnemies = this._enemies.filter(enemy => !enemy.isExpired());
        this._enemies = newEnemies;

        if (this._totalElpseTime >= this._nextEnemyComingTime) {
            if (this._enemies.length = 5) {
                let x = Math.floor(getRandomInclusive(0, this._canvasWidth));
                let y = Math.floor(getRandomInclusive(0, this._canvasHeight));
                let duration = Math.floor(getRandomInclusive(1, 3)) * 1000;
                this._enemies.push(new Enemy(this._enemyWidth, x, y, duration));
            }

            this._nextEnemyComingTime = this._totalElpseTime + (getRandomInclusive(1, 2) * 1000);
        }
    }

    draw(ctx) {
        this._enemies.forEach(enemy => {
            enemy.draw(ctx);
        });
    }
}

class Enemy {
    constructor(enemyWidth, x, y, livePeriodInMillisec) {
        this._smile = new Image();
        this._smile.src = "images/smile.png";

        this._dead = new Image();
        this._dead.src = "images/dead.png"

        this._isExpired = false;
        this._isAlive = true;
        this._enemyWidth = enemyWidth;
        this._x = x;
        this._y = y;
        this._livePeriodInMillisec = livePeriodInMillisec;
        this._durationInMillisec = 0;
    }

    isExpired() {
        return this._isExpired;
    }

    update(progressTimeInMillisec, keypoints, scale) {
        this._durationInMillisec += progressTimeInMillisec;
        this._isExpired = this._livePeriodInMillisec <= this._durationInMillisec;
        if (this._isAlive && this._detectCollision(keypoints, scale)) {
            this._isAlive = false;
            this._livePeriodInMillisec = this._durationInMillisec + 500;
        }
    }

    _detectCollision(keypoints, scale) {
        let targets = ['leftWrist', 'rightWrist', 'leftAnkle', 'rightAnkle'].map((name) => {
            return keypoints[posenet.partIds[name]];
        });
        let results = targets.filter(target =>
            target.score > 0.5
            && Math.abs(target.position.x * scale - this._x) < this._enemyWidth
            && Math.abs(target.position.y * scale - this._y) < this._enemyWidth
        );
        return results.length > 0;
    }

    draw(ctx) {
        if (this._isAlive) {
            ctx.drawImage(
                this._smile,
                this._x - this._enemyWidth / 2,
                this._y - this._enemyWidth / 2,
                this._enemyWidth,
                this._enemyWidth
            );
        } else {
            ctx.drawImage(
                this._dead,
                this._x - this._enemyWidth / 2,
                this._y - this._enemyWidth / 2,
                this._enemyWidth,
                this._enemyWidth
            );
        }
    }
}

function drawKeypoints(keypoints, ctx, scale = 1) {
    for (let i = 0; i < keypoints.length; i++) {
        const keypoint = keypoints[i];
        const { y, x } = keypoint.position;
        drawPoint(ctx, y * scale, x * scale, 3, 'aqua');
        ctx.fillText(keypoint.part, x * scale + 5, y * scale - 5);
    }
}

function drawPoint(ctx, y, x, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
}

function drawSkeleton(keypoints, ctx, scale = 1) {
    const adjacentKeyPoints =
        posenet.getAdjacentKeyPoints(keypoints, 0.5);

    function toTuple({ y, x }) {
        return [y, x];
    }

    adjacentKeyPoints.forEach((keypoints) => {
        drawSegment(
            toTuple(keypoints[0].position), toTuple(keypoints[1].position), 'aqua',
            scale, ctx);
    });
}

function drawSegment([ay, ax], [by, bx], color, scale, ctx) {
    ctx.beginPath();
    ctx.moveTo(ax * scale, ay * scale);
    ctx.lineTo(bx * scale, by * scale);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
}

async function setupCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
            'Browser API navigator.mediaDevices.getUserMedia not available');
    }

    const video = document.getElementById('video');
    video.width = idealWidth;
    video.height = idealHeight;

    const stream = await navigator.mediaDevices.getUserMedia({
        'audio': false,
        'video': {
            facingMode: 'user',
            width: { ideal: idealWidth },
            height: { ideal: idealHeight },
        },
    });
    video.srcObject = stream;

    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            resolve(video);
        };
    });
}

async function loadVideo() {
    const video = await setupCamera();
    video.play();
    return video;
}

function detectPoseInRealTime(video, net) {
    const face = new Face("images/happy.png");
    const canvas = document.getElementById('output');

    canvas.addEventListener("click", function (event) {
        canvas.requestFullscreen();
    }, false);
    canvas.addEventListener("touchstart", function (event) {
        canvas.requestFullscreen();
    }, false);

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    const drawScale = Math.min(
        window.innerWidth / videoWidth,
        window.innerHeight / videoHeight
    );

    const canvasWidth = Math.round(drawScale * videoWidth);
    const canvasHeight = Math.round(drawScale * videoHeight);

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext('2d');

    const enemyManager = new EnemyManager(canvasWidth, canvasHeight);

    let lastTime = performance.now();
    let remainingTime = 30 * 1000;

    async function poseDetectionFrame() {
        // Begin monitoring code for frames per second
        stats.begin();

        let poses = await net.estimatePoses(video, {
            flipHorizontal: true,
            decodingMethod: 'single-person'
        });
        let pose = poses[0];
        let keypoints = pose.keypoints;

        let now = performance.now();
        let elapsedTime = now - lastTime;
        remainingTime -= elapsedTime;
        remainingTime = Math.max(0, remainingTime);
        lastTime = now;

        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvasWidth, 0);
        ctx.drawImage(video, 0, 0, canvasWidth, canvasHeight);
        ctx.restore();

        ctx.save();
        ctx.scale(1, 1);

        face.draw(keypoints, ctx, drawScale);

        if (remainingTime > 0) {
            enemyManager.update(elapsedTime, keypoints, drawScale);
            enemyManager.draw(ctx);
        }

        if (showKeypoints) {
            drawKeypoints(keypoints, ctx, drawScale);
            drawSkeleton(keypoints, ctx, drawScale);
        }

        let remain = Math.round(remainingTime / 1000);
        ctx.fillStyle = 'rgba(0, 0, 0)';
        ctx.font = "50px serif";
        ctx.fillText("残り " + remain + " 秒", 10, canvasHeight - 50);

        ctx.restore();

        // End monitoring code for frames per second
        stats.end();

        requestAnimationFrame(poseDetectionFrame);
    }

    poseDetectionFrame();
}

function setupFPS() {
    if (debug) {
        stats.showPanel(0);
        let elm = stats.domElement;
        elm.style.position = "absolute";
        elm.style.top = 0;
        elm.style.left = 0;
        document.getElementById('main').appendChild(elm);
    }
}

async function bindPage() {
    if (isMobile) {
        setTimeout(function () { window.scrollTo(0, 1); }, 100);
    }

    const net = await posenet.load(posenetParams);

    let video;
    try {
        video = await loadVideo();
    } catch (e) {
        throw e;
    }

    setupFPS();
    detectPoseInRealTime(video, net);
}

bindPage();