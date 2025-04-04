const express = require('express');
const fs = require('fs'); // for createReadStream
const fsp = require('fs').promises; // for access (Promise-based)
const csv = require('csv-parser');
const path = require('path');
const cors = require('cors');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Serve static files (HTML, CSS)

app.use(cors({
    origin: 'https://verdant-profiterole-9e05e2.netlify.app',  // your Netlify frontend URL
    methods: ['POST', 'GET'],
    credentials: true
}));

// File paths
const csv1Path = path.join(__dirname, 'GpaData.csv');
const csv2Path = path.join(__dirname, "AttachmentHUM_1071_-_08-2025.csv");

// Read CSV helper
function readCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

// Input validation
function validateInput(name) {
    if (!name) throw new Error('Name is required');
    if (name.length < 2 || name.length > 100) throw new Error('Name must be between 2 and 100 characters');
    const nameRegex = /^[a-zA-Z\s-]+$/;
    if (!nameRegex.test(name)) throw new Error('Name can only contain letters, spaces, and hyphens');
    return name.trim().toLowerCase();
}

// Find roommates
async function findRoommates(name) {
    try {
        const sanitizedName = validateInput(name);

        const [df1, df2] = await Promise.all([
            readCSV(csv1Path),
            readCSV(csv2Path)
        ]);

        const student = df2.find(row => row.Name.trim().toLowerCase() === sanitizedName);
        if (!student) return "Student not found. Please check the name spelling.";

        const regNo = student["Registration No"].trim();

        const matchedStudents = df1.filter(row => row["Registration No"].trim() === regNo);
        if (matchedStudents.length === 0) return "No matching registration number found in GPA data.";

        const roommateRegNos = df1
            .filter(row => row.Name.trim().toLowerCase() === matchedStudents[0].Name.trim().toLowerCase())
            .map(row => row["Registration No"].trim())
            .filter(rn => rn !== regNo);

        const roommates = df2.filter(row => roommateRegNos.includes(row["Registration No"].trim()));
        if (roommates.length === 0) return "No roommates found for this student.";

        return "Roommates found: " + roommates.map(row => `${row.Name} (Reg No: ${row["Registration No"]})`).join(", ");

    } catch (error) {
        console.error('Error in findRoommates:', error);
        return `Error: ${error.message}`;
    }
}

// Error middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong! Please try again later.');
});

// Route
app.post('/find-roommates', async (req, res, next) => {
    try {
        const name = req.body.name;
        const result = await findRoommates(name);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res, next) => {
    res.status(404).send('Page not found');
});

// Server + CSV file verification
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);

    try {
        await Promise.all([
            fsp.access(csv1Path),
            fsp.access(csv2Path)
        ]);
        console.log('CSV files verified successfully');
    } catch (error) {
        console.error('Error accessing CSV files:', error);
        process.exit(1);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});
