# NimbusKit Invoice Generator

Professional invoice generator with PDF export functionality. Generate beautiful invoices in seconds!

![Invoice Generator](https://img.shields.io/badge/version-1.0.0-blue)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Features

- 🎨 **Clean Professional UI** - Modern, responsive design
- 📄 **PDF Generation** - Auto-download invoices instantly
- 🖼️ **Logo Upload** - Upload company logo (converted to base64)
- 💰 **Multi-Currency** - Support for USD, EUR, GBP, INR, CAD, AUD
- 🧮 **Smart Calculations** - Real-time totals, tax, discounts
- 📦 **Multiple Line Items** - Add unlimited products/services
- 💾 **Invoice History** - View recent invoices (current session)
- 🔒 **Secure** - API key embedded, no data stored externally

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ ([Download](https://nodejs.org/))
- npm (comes with Node.js)

### Installation

```bash
# 1. Clone or download the project
git clone <your-repo-url>
cd invoice-generator

# 2. Install dependencies
npm install

# 3. Start the server
npm start

# 4. Open browser
http://localhost:3001
```

## 📁 Project Structure

```
invoice-generator/
├── public/
│   ├── index.html          # Main interface
│   ├── styles.css          # Styling
│   └── script.js           # Frontend logic
├── done/                   # Generated PDFs (auto-created)
├── server.js               # Backend server
├── package.json            # Dependencies
├── .gitignore             # Git ignore rules
└── README.md              # This file
```

## 🎯 Usage

1. **Upload Logo** (optional)
   - Click "+ Add Your Logo"
   - Select image file (PNG, JPG, GIF)
   - Max size: 2MB

2. **Fill Company Details**
   - Your company name and address
   - Client information

3. **Add Invoice Details**
   - Invoice number (auto-increments)
   - Date and payment terms
   - Due date

4. **Add Line Items**
   - Product/service descriptions
   - Quantities and rates
   - Click "+ Line Item" to add more

5. **Add Charges** (optional)
   - Tax (percentage or flat)
   - Discount (via "+ Discount")
   - Shipping (via "+ Shipping")

6. **Generate**
   - Click "Create" button
   - PDF downloads automatically!
   - Also saved to `done/` folder

## 💻 Local Development

```bash
# Start development server
npm start

# Server runs on
http://localhost:3001
```

## 🌐 Deployment

### Option 1: Render.com (Recommended - FREE)

1. Push to GitHub
2. Go to [render.com](https://render.com)
3. New → Web Service
4. Connect repository
5. Deploy!

**Settings:**
- Build Command: `npm install`
- Start Command: `npm start`
- Environment: Node

[Detailed Guide →](DEPLOY-TO-RENDER.txt)

### Option 2: Railway.app (FREE)

1. Push to GitHub
2. Go to [railway.app](https://railway.app)
3. New Project → Deploy from GitHub
4. Select repository
5. Deploy!

### Option 3: Other Options

- Cyclic.sh
- Fly.io
- Glitch.com

See [FREE-HOSTING-OPTIONS.txt](FREE-HOSTING-OPTIONS.txt) for details.

## 🔧 Configuration

### Change Port

Edit `server.js`:
```javascript
const PORT = process.env.PORT || 3001;
```

### API Key

API key is pre-configured in `script.js`:
```javascript
const API_KEY = 'sk_6awg6fl8gt5JtbcQfXMeAcLGOPyhANQ2';
```

Free tier: 100 invoices/month

### Currency

Select from sidebar dropdown:
- USD ($)
- EUR (€)
- GBP (£)
- INR (₹)
- CAD ($)
- AUD ($)

## 📋 API Endpoints

### Generate Invoice
```
POST /api/generate-invoice
Body: { apiKey, invoiceData }
```

### Get Invoices List
```
GET /api/invoices
```

### Download Invoice
```
GET /api/invoices/:filename
```

### Delete Invoice
```
DELETE /api/invoices/:filename
```

## 🛠️ Technologies

- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Backend:** Node.js, Express.js
- **PDF Generation:** Invoice Generator API
- **Storage:** File system (temporary)

## ⚠️ Important Notes

### File Storage

- PDFs saved to `done/` folder locally
- On free hosting: Files are **temporary** (deleted on restart)
- PDFs auto-download to user anyway, so this is fine!
- For permanent storage, integrate cloud storage (AWS S3, etc.)

### App Sleep (Free Hosting)

- Render.com: App sleeps after 15 min inactivity
- First visit takes 30-60 seconds to wake up
- Subsequent visits are instant
- This is normal for free tier!

## 🐛 Troubleshooting

### "Backend server not running"
- Check if server is running: `npm start`
- Verify port 3001 is available
- On deployed apps: Wait 30-60 seconds for wake up

### Logo not showing in PDF
- Ensure image is under 2MB
- Use supported formats: PNG, JPG, GIF
- Image is converted to base64 automatically

### Port already in use
- Change port in `server.js`
- Or kill process: `taskkill /F /IM node.exe` (Windows)

### PDF not downloading
- Check browser download settings
- Allow downloads from the site
- Check browser console for errors

## 📝 License

MIT License - feel free to use for personal or commercial projects!

## 🙏 Credits

- Invoice Generator API: [invoice-generator.com](https://invoice-generator.com)
- NimbusKit Design System

## 📧 Support

Need help? Create an issue or contact support.

---

**Made with ❤️ by NimbusKit**