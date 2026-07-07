const fs = require('fs');
const path = require('path');
const https = require('https');

const dataPath = path.join(__dirname, 'GetAllAchievementDesc.json');
const iconsDir = path.join(__dirname, 'ff-achievement');
const CONCURRENCY_LIMIT = 50;
const BASE_URL = "https://dl.dir.freefiremobile.com/common/";

const stats = {
    downloaded: 0,
    skipped: 0,
    failed: 0,
    failedUrls: []
};

if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir);
}

function processUrl(cdnPath) {
    if (!cdnPath || typeof cdnPath !== 'string') return null;
    
    let processedPath = cdnPath.replace(/\.ff_extend$/i, '.jpg');
    
    return {
        fullUrl: BASE_URL + processedPath,
        fileName: path.basename(processedPath)
    };
}

function downloadImage(urlInfo) {
    return new Promise((resolve) => {
        if (!urlInfo) {
            resolve();
            return;
        }

        const filePath = path.join(iconsDir, urlInfo.fileName);

        if (fs.existsSync(filePath)) {
            stats.skipped++;
            resolve();
            return;
        }

        https.get(urlInfo.fullUrl, (res) => {
            if (res.statusCode === 200) {
                const fileStream = fs.createWriteStream(filePath);
                res.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    stats.downloaded++;
                    console.log(`[+] Downloaded: ${urlInfo.fileName}`);
                    resolve();
                });
            } else {
                stats.failed++;
                stats.failedUrls.push(urlInfo.fullUrl);
                console.log(`[-] Failed (${res.statusCode}): ${urlInfo.fileName}`);
                resolve();
            }
        }).on('error', (err) => {
            stats.failed++;
            stats.failedUrls.push(urlInfo.fullUrl);
            console.log(`[-] Error downloading ${urlInfo.fileName}: ${err.message}`);
            resolve();
        });
    });
}

async function start() {
    if (!fs.existsSync(dataPath)) {
        console.error(`[!] Error: ${dataPath} not found.`);
        return;
    }

    const rawData = fs.readFileSync(dataPath, 'utf8');
    let data;
    try {
        data = JSON.parse(rawData);
    } catch (e) {
        console.error('[!] Error parsing JSON.');
        return;
    }

    const tasks = [];
    const uniqueFiles = new Set();
    const sections = ["achEntriesDesc", "totalAchLevelConfig", "battleAchLevelConfig", "careerAchLevelConfig", "collectionAchLevelConfig", "1"];

    sections.forEach(section => {
        if (data[section]) {
            const itemsArray = Array.isArray(data[section]) ? data[section] : Object.values(data[section]);
            itemsArray.forEach(item => {
                const iconPath = item.iconCdn || item["7"];
                if (iconPath) {
                    const urlInfo = processUrl(iconPath);
                    if (urlInfo && !uniqueFiles.has(urlInfo.fileName)) {
                        uniqueFiles.add(urlInfo.fileName);
                        tasks.push(() => downloadImage(urlInfo));
                    }
                }
                if (item.logoCdn) {
                    const urlInfo = processUrl(item.logoCdn);
                    if (urlInfo && !uniqueFiles.has(urlInfo.fileName)) {
                        uniqueFiles.add(urlInfo.fileName);
                        tasks.push(() => downloadImage(urlInfo));
                    }
                }
            });
        }
    });

    console.log(`[i] Found ${tasks.length} unique images to process.`);

    let currentIndex = 0;

    async function worker() {
        while (currentIndex < tasks.length) {
            const task = tasks[currentIndex++];
            await task();
        }
    }

    const workers = [];
    for (let i = 0; i < CONCURRENCY_LIMIT; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);

    console.log('\n====================================');
    console.log('         DOWNLOAD SUMMARY           ');
    console.log('====================================');
    console.log(`Total Found     : ${tasks.length}`);
    console.log(`Skipped (Exists): ${stats.skipped}`);
    console.log(`Downloaded New  : ${stats.downloaded}`);
    console.log(`Failed          : ${stats.failed}`);
    
    if (stats.failedUrls.length > 0) {
        console.log('------------------------------------');
        console.log('Failed URLs:');
        stats.failedUrls.forEach(url => console.log(url));
    }
    console.log('====================================\n');
}

start();
