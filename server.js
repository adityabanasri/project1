const express = require('express');
const fs = require('fs').promises;
const csv = require('csv-parser');
const path = require('path');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Serve static files (HTML, CSS)

// File paths
const csv1Path = path.join(__dirname, 'GpaData.csv');
const csv2Path = path.join(__dirname, "AttachmentHUM_1071_-_08-2025.csv");

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

// Input validation function
function validateInput(name) {
    // Check if name is provided
    if (!name) {
        throw new Error('Name is required');
    }

    // Check name length (adjust as needed)
    if (name.length < 2 || name.length > 100) {
        throw new Error('Name must be between 2 and 100 characters');
    }

    // Check for invalid characters (allow letters, spaces, and hyphens)
    const nameRegex = /^[a-zA-Z\s-]+$/;
    if (!nameRegex.test(name)) {
        throw new Error('Name can only contain letters, spaces, and hyphens');
    }

    return name.trim().toLowerCase();
}

async function findRoommates(name) {
    try {
        // Validate input first
        const sanitizedName = validateInput(name);

        // Read CSV files
        const [df1, df2] = await Promise.all([
            readCSV(csv1Path),
            readCSV(csv2Path)
        ]);

        // Find student registration number
        const student = df2.find(row => row.Name.trim().toLowerCase() === sanitizedName);
        if (!student) {
            return "Student not found. Please check the name spelling.";
        }

        const regNo = student["Registration No"].trim();

        // Find matching registration number in df1
        const matchedStudents = df1.filter(row => row["Registration No"].trim() === regNo);
        if (matchedStudents.length === 0) {
            return "No matching registration number found in GPA data.";
        }

        // Extract roommate registration numbers
        const roommateRegNos = df1
            .filter(row => row.Name.trim().toLowerCase() === matchedStudents[0].Name.trim().toLowerCase())
            .map(row => row["Registration No"].trim())
            .filter(rn => rn !== regNo);

        // Find roommates' names
        const roommates = df2.filter(row => roommateRegNos.includes(row["Registration No"].trim()));
        if (roommates.length === 0) {
            return "No roommates found for this student.";
        }

        return "Roommates found: " + roommates.map(row => `${row.Name} (Reg No: ${row["Registration No"]})`).join(", ");

    } catch (error) {
        console.error('Error in findRoommates:', error);
        return `Error: ${error.message}`;
    }
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong! Please try again later.');
});

// API Route with additional error handling
app.post('project1.railway.internal/find-roommates', async (req, res, next) => {
    try {
        const name = req.body.name;
        const result = await findRoommates(name);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

// Serve HTML File
app.get('project1.railway.internal/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res, next) => {
    res.status(404).send('Page not found');
});

// Start Server with improved startup logging
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // Validate CSV files exist at startup
    Promise.all([
        fs.access(csv1Path),
        fs.access(csv2Path)
    ])
    .then(() => console.log('CSV files verified successfully'))
    .catch(error => {
        console.error('Error accessing CSV files:', error);
        process.exit(1);
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});
