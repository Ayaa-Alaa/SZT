require('dotenv').config();
const { ethers } = require('ethers');
const axios = require('axios');
const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');

const CHAIN_ID = 16601;
const RPC_URL = 'https://evmrpc-testnet.0g.ai';
const CONTRACT_ADDRESS = '0x5f1d96895e442fc0168fa2f9fb1ebef93cb5035e';
const INDEXER_URL = 'https://indexer-storage-testnet-turbo.0g.ai';
const EXPLORER_URL = 'https://chainscan-galileo.0g.ai/tx/';
const PROXY_FILE = 'proxies.txt';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let privateKeys = [];
let currentKeyIndex = 0;
let proxies = [];
let currentProxyIndex = 0;

// Fungsi untuk mengambil delay acak antara 60 hingga 120 detik
const randomDelay = () => {
  const delayTime = Math.floor(Math.random() * (120000 - 60000 + 1)) + 60000;
  return new Promise(resolve => setTimeout(resolve, delayTime));
};

// Memuat Private Keys dari .env
function loadPrivateKeys() {
  let index = 1;
  let key = process.env[`PRIVATE_KEY_${index}`];

  if (!key && index === 1 && process.env.PRIVATE_KEY) {
    key = process.env.PRIVATE_KEY;
  }

  while (key) {
    privateKeys.push(key);
    index++;
    key = process.env[`PRIVATE_KEY_${index}`];
  }
}

// Rotasi Private Key untuk distribusi transaksi
function getNextPrivateKey() {
  return privateKeys[currentKeyIndex];
}

function rotatePrivateKey() {
  currentKeyIndex = (currentKeyIndex + 1) % privateKeys.length;
  return privateKeys[currentKeyIndex];
}

// Memuat daftar proxy dari file eksternal
function loadProxies() {
  try {
    if (fs.existsSync(PROXY_FILE)) {
      const data = fs.readFileSync(PROXY_FILE, 'utf8');
      proxies = data.split('\n').map(line => line.trim()).filter(line => line);
      console.log(`Loaded ${proxies.length} proxies from file.`);
    }
  } catch (error) {
    console.error(`Error loading proxies: ${error.message}`);
  }
}

// Menggunakan proxy secara bergilir
function getNextProxy() {
  if (proxies.length === 0) return null;
  const proxy = proxies[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
  return proxy;
}

// Membuat instance Axios dengan pengaturan proxy dan header yang sesuai
function createAxiosInstance() {
  const config = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible)',
      'accept': 'application/json',
    }
  };

  const proxy = getNextProxy();
  if (proxy) {
    config.httpsAgent = new HttpsProxyAgent(proxy);
  }

  return axios.create(config);
}

// Mengecek apakah jaringan blockchain sudah sinkron
async function checkNetworkSync(provider) {
  try {
    const blockNumber = await provider.getBlockNumber();
    console.log(`Network synced at block ${blockNumber}`);
    return true;
  } catch (error) {
    console.error(`Network sync check failed: ${error.message}`);
    return false;
  }
}

// Fungsi untuk mengambil file dari folder `storage`
function getLocalFiles() {
  const storageDir = path.join(__dirname, 'storage');
  try {
    let files = fs.readdirSync(storageDir).filter(file => fs.lstatSync(path.join(storageDir, file)).isFile());
    files.sort();
    return files.map(file => path.join(storageDir, file));
  } catch (error) {
    return [];
  }
}

function fetchLocalFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

// Fungsi untuk mengambil random file dari Picsum
async function fetchRandomImageFromPicsum() {
  try {
    const axiosInstance = createAxiosInstance();
    const response = await axiosInstance.get('https://picsum.photos/200', { responseType: 'arraybuffer' });
    return response.data;
  } catch (error) {
    throw error;
  }
}

// Fungsi untuk membuat hash file
async function prepareImageData(imageBuffer) {
  const hash = '0x' + crypto.createHash('sha256').update(imageBuffer).digest('hex');
  return { root: hash, data: imageBuffer.toString('base64') };
}

// Fungsi untuk mengunggah file ke storage
async function uploadToStorage(imageData, wallet) {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const value = ethers.parseEther('0.000839233398436224');
    const txParams = {
      to: CONTRACT_ADDRESS,
      data: imageData.root,
      value,
      gasLimit: 300000,
      gasPrice: ethers.parseUnits('1.029599997', 'gwei'),
      chainId: CHAIN_ID
    };

    const tx = await wallet.sendTransaction(txParams);
    await tx.wait();
    console.log(`✅ File uploaded, root hash: ${imageData.root}`);
  } catch (error) {
    console.error(`❌ Upload failed: ${error.message}`);
  }
}

// Fungsi utama
async function main() {
  try {
    loadPrivateKeys();
    loadProxies();
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    
    const isNetworkSynced = await checkNetworkSync(provider);
    if (!isNetworkSynced) {
      throw new Error('Network is not synced');
    }

    rl.question(`Pilih mode upload:\n [1] Ambil random file dari Picsum\n [2] Unggah file dari folder storage\nMasukkan pilihan (1 atau 2): `, async (option) => {
      option = option.trim();

      if (option === '1') {
        let successful = 0;
        let failed = 0;

        for (const key of privateKeys) {
          const wallet = new ethers.Wallet(key, provider);
          try {
            const imageBuffer = await fetchRandomImageFromPicsum();
            const imageData = await prepareImageData(imageBuffer);
            await uploadToStorage(imageData, wallet);
            successful++;
          } catch (error) {
            failed++;
          }
          await randomDelay();
        }

        rl.close();
        process.exit(0);
      } else if (option === '2') {
        const localFiles = getLocalFiles();
        if (localFiles.length === 0) {
          rl.close();
          process.exit(1);
        }

        let successful = 0;
        let failed = 0;

        for (let i = 0; i < localFiles.length; i++) {
          const wallet = new ethers.Wallet(getNextPrivateKey(), provider);
          rotatePrivateKey();
          try {
            const fileBuffer = await fetchLocalFile(localFiles[i]);
            const imageData = await prepareImageData(fileBuffer);
            await uploadToStorage(imageData, wallet);
            successful++;
          } catch (error) {
            failed++;
          }
          await randomDelay();
        }

        rl.close();
        process.exit(0);
      }
    });
  } catch (error) {
    rl.close();
    process.exit(1);
  }
}

main();
