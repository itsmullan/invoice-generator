const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;
const DONE_FOLDER = path.join(__dirname, 'done');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

async function ensureDoneFolder() {
    try {
        await fs.access(DONE_FOLDER);
    } catch {
        await fs.mkdir(DONE_FOLDER, { recursive: true });
    }
}

ensureDoneFolder();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/generate-invoice', async (req, res) => {
    try {
        const { apiKey, invoiceData } = req.body;
        
        const response = await fetch('https://invoice-generator.com', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(invoiceData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({ 
                error: `API Error: ${response.status} - ${errorText}` 
            });
        }
        
        const buffer = await response.buffer();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `invoice-${invoiceData.number}-${timestamp}.pdf`;
        const filepath = path.join(DONE_FOLDER, filename);
        
        await fs.writeFile(filepath, buffer);
        
        res.json({ 
            success: true, 
            filename: filename,
            path: filepath,
            message: `Invoice saved to done/${filename}`
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/invoices', async (req, res) => {
    try {
        const files = await fs.readdir(DONE_FOLDER);
        const pdfFiles = files.filter(f => f.endsWith('.pdf'));
        
        const invoices = await Promise.all(
            pdfFiles.map(async (filename) => {
                const filepath = path.join(DONE_FOLDER, filename);
                const stats = await fs.stat(filepath);
                return {
                    filename,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime
                };
            })
        );
        
        invoices.sort((a, b) => b.created - a.created);
        res.json({ invoices });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/invoices/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path.join(DONE_FOLDER, filename);
        await fs.access(filepath);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        const fileBuffer = await fs.readFile(filepath);
        res.send(fileBuffer);
    } catch (error) {
        res.status(404).json({ error: 'Invoice not found' });
    }
});

app.delete('/api/invoices/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path.join(DONE_FOLDER, filename);
        await fs.unlink(filepath);
        res.json({ success: true, message: `Deleted ${filename}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✓ Server running on http://localhost:${PORT}`);
    console.log(`✓ Invoices will be saved to: ${DONE_FOLDER}`);
    console.log(`✓ Ready to generate invoices!`);
});