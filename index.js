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
const METHOD_ID = '0xef3e12dc';
const INDEXER_URL = 'https://indexer-storage-testnet-turbo.0g.ai';
const EXPLORER_URL = 'https://chainscan-galileo.0g.ai/tx/';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let privateKeys = [];
let currentKeyIndex = 0;

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
    const response = await axios.get('https://picsum.photos/200', { responseType: 'arraybuffer' });
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
async function uploadToStorage(imageData, wallet, walletIndex) {
  try {
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

    rl.question(`Pilih mode upload:\n [1] Ambil random file dari Picsum\n [2] Unggah file dari folder storage\nMasukkan pilihan (1 atau 2): `, async (option) => {
      option = option.trim();

      if (option === '1') {
        rl.question('Jumlah file yang ingin diupload per wallet? ', async (count) => {
          count = parseInt(count);
          if (isNaN(count) || count <= 0) {
            rl.close();
            process.exit(1);
            return;
          }

          let successful = 0;
          let failed = 0;

          for (let walletIndex = 0; walletIndex < privateKeys.length; walletIndex++) {
            currentKeyIndex = walletIndex;
            const wallet = new ethers.Wallet(privateKeys[walletIndex], new ethers.JsonRpcProvider(RPC_URL));

            for (let i = 1; i <= count; i++) {
              try {
                const imageBuffer = await fetchRandomImageFromPicsum();
                const imageData = await prepareImageData(imageBuffer);
                await uploadToStorage(imageData, wallet, walletIndex);
                successful++;
              } catch (error) {
                failed++;
              }
              await randomDelay(); // Menambahkan delay acak sebelum upload berikutnya
            }
          }

          rl.close();
          process.exit(0);
        });

      } else if (option === '2') {
        const localFiles = getLocalFiles();
        if (localFiles.length === 0) {
          rl.close();
          process.exit(1);
        }

        let successful = 0;
        let failed = 0;

        for (let i = 0; i < localFiles.length; i++) {
          const walletIndex = i % privateKeys.length;
          currentKeyIndex = walletIndex;
          const wallet = new ethers.Wallet(privateKeys[walletIndex], new ethers.JsonRpcProvider(RPC_URL));

          try {
            const fileBuffer = await fetchLocalFile(localFiles[i]);
            const imageData = await prepareImageData(fileBuffer);
            await uploadToStorage(imageData, wallet, walletIndex);
            successful++;
          } catch (error) {
            failed++;
          }
          await randomDelay(); // Menambahkan delay acak sebelum upload berikutnya
        }

        rl.close();
        process.exit(0);
      } else {
        rl.close();
        process.exit(1);
      }
    });
  } catch (error) {
    rl.close();
    process.exit(1);
  }
}

main();
