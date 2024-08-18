const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const fs = require('fs');
const dayjs = require('dayjs'); // For date manipulation
const path = require('path'); // For handling file paths

const app = express();
app.use(bodyParser.json());
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Load client secrets from a local file.
// const keys = JSON.parse(fs.readFileSync('credential.json', 'utf8'));
// const client = new google.auth.JWT(
//    keys.client_email,
//    null, 
//    keys.private_key.replace(/\\n/g, '\n'), // Ensure the private key is correctly formatted
//    ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
// );

const client = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Ensure the private key is correctly formatted
    ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
);

client.authorize((err, tokens) => {
    if (err) {
        console.error('Error connecting to Google Sheets API:', err);
        return;
    } else {
        console.log('Connected to Google Sheets API');
    }
});

const sheets = google.sheets({ version: 'v4', auth: client });
// const spreadsheetId = "1NbcwKdFAwm0RRw5JIpaOMtCibWM_9gsUbYCOQ2GUNlI";
const spreadsheetId = process.env.SPREADSHEET_ID;


// Function to generate a unique 6-digit ID
function generateUniqueId(existingIds) {
    let uniqueId;
    do {
        uniqueId = Math.floor(100000 + Math.random() * 900000); // Generate a random 6-digit number
    } while (existingIds.includes(uniqueId));
    return uniqueId;
}

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html')
})
app.get('/student_management', (req, res) => {
    res.sendFile(__dirname + '/public/student.html')
})
app.get('/student_management/student_stats', (req, res) => {
    res.sendFile(__dirname + '/public/student_stats.html')
})
app.get('/class_management', (req, res) => {
    res.sendFile(__dirname + '/public/class.html')
})
app.get('/class_management/class_stats', (req, res) => {
    res.sendFile(__dirname + '/public/class_stats.html')
})
app.get('/class_management/class_stats/lecture_stats', (req, res) => {
    res.sendFile(__dirname + '/public/lecture_stats.html')
})


// Get all students
app.get('/students', (req, res) => {
    const range = 'student!A2:G';
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) return res.status(500).send(err);
        res.json(result.data.values);
    });
});
// Get all students with specific classes
app.get('/classes/:id/students', (req, res) => {
    const range = 'student!A2:G'; // Assuming column G contains the status
    const range2 = 'enrollment!A2:D';
    const classId = req.params.id;

    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) return res.status(500).send(err);

        // Filter active students
        const activeStudents = result.data.values ? result.data.values.filter(row => row[6] === 'active') : [];
        const activeStudentIds = activeStudents.map(row => row[0]); // Assuming column A contains the student ID

        sheets.spreadsheets.values.get({ spreadsheetId, range: range2 }, (err, enrollResult) => {
            if (err) return res.status(500).send(err);

            // Filter enrollment data for the specific class and active students
            const data = enrollResult.data.values ? enrollResult.data.values.filter(row => row[2] === classId && activeStudentIds.includes(row[1])) : [];
            const data2 = activeStudents.filter(row => data.map(enrollRow => enrollRow[1]).includes(row[0]));

            res.json(data2);
        });
    });
});
// Get all classes with specific students
app.get('/students/:id/classes', (req, res) => {
    const range = 'class!A2:G';
    const range2 = 'enrollment!A2:D';
    const studentId = req.params.id;
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) return res.status(500).send(err);
        sheets.spreadsheets.values.get({ spreadsheetId, range: range2 }, (err, enrollResult) => {
            if (err) return res.status(500).send(err);
                const data = enrollResult.data.values ? enrollResult.data.values.filter(row => row[1] === studentId) : [];
                const data2 = result.data.values ? result.data.values.filter(row => data.map(row => row[2]).includes(row[0])) : [];
            res.json(data2);
            })
    });
});

// Add a new student
app.post('/addstudents', (req, res) => {
    const { name, phone, enrollment_date, school, generation, status } = req.body;
    
    // Fetch existing students to determine the next available ID
    const range = 'student!A2:G'; // Only fetch the ID column
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) {
            console.error('Error fetching data from Google Sheets:', err);
            return res.status(500).send('Error fetching data from Google Sheets');
        }
        

        const students = result.data.values || [];
        const existingStudent = students.find(student => student[1] === name && student[2] === phone);
        
        if (existingStudent) {
            return res.status(400).send('Student with the same name and phone number already exists.');
        }

        // Extract existing IDs and determine the next unique 6-digit ID
        const existingIds = students.map(student => parseInt(student[0]));
        const nextId = generateUniqueId(existingIds);
        
        const newRange = 'student!A:G';
        const values = [[nextId, name, phone, enrollment_date, school, generation, status || 'active']];
        const resource = { values };
        
        // Append the new student data to the sheet
        sheets.spreadsheets.values.append({
            spreadsheetId,
            range: newRange,
            valueInputOption: 'RAW',
            resource,
        }, (err, result) => {
            if (err) {
                console.error('Error appending data to Google Sheets:', err);
                return res.status(500).send('Error appending data to Google Sheets');
            }
            res.send('Student added');
        });
    });
});


app.get('/students/:id/activate', (req, res) => {
    const studentId = req.params.id;
    const range = 'student!A2:G'; 
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
    if (err) {
        console.error('Error fetching data from Google Sheets:', err);
        return res.status(500).send('Error fetching data from Google Sheets');
    }    
    const rows = result.data.values
    const rowIndex = rows.findIndex(row => row[0] === studentId);

    if (rows[rowIndex][6] === 'active'){
        return res.status(400).send('Student is already active')
    }
    rows[rowIndex][6] = 'active';

    const updateRange =  `student!A${rowIndex + 2}:G${rowIndex + 2}`;
    const resource = { values: [rows[rowIndex]] };

    sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: 'RAW',
        resource,
    }, (err, result) => {
        if (err) return res.status(500).send(err);
        res.send('Student Activated');
    });
})
})
app.get('/students/:id/inactivate', (req, res) => {
    const studentId = req.params.id;
    const range = 'student!A2:G'; 
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
    if (err) {
        console.error('Error fetching data from Google Sheets:', err);
        return res.status(500).send('Error fetching data from Google Sheets');
    }    
    const rows = result.data.values
    const rowIndex = rows.findIndex(row => row[0] === studentId);

    if (rows[rowIndex][6] === 'inactive'){
        return res.status(400).send('Student is already inactive')
    }
    rows[rowIndex][6] = 'inactive';

    const updateRange =  `student!A${rowIndex + 2}:G${rowIndex + 2}`;
    const resource = { values: [rows[rowIndex]] };

    sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: 'RAW',
        resource,
    }, (err, result) => {
        if (err) return res.status(500).send(err);
        res.send('Student Inactivated');
    });
})
})

// Update student status
app.put('/students/:id/status', (req, res) => {
    const studentId = req.params.id;
    const { status } = req.body;

    const range = 'student!A2:G'; // Assuming student data starts from row 2
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) return res.status(500).send(err);

        const rows = result.data.values;
        const rowIndex = rows.findIndex(row => row[0] == studentId);

        if (rowIndex === -1) {
            return res.status(404).send('Student not found');
        }

        rows[rowIndex][6] = status;

        const updateRange = `student!A${rowIndex + 2}:G${rowIndex + 2}`;
        const resource = { values: [rows[rowIndex]] };

        sheets.spreadsheets.values.update({
            spreadsheetId,
            range: updateRange,
            valueInputOption: 'RAW',
            resource,
        }, (err, result) => {
            if (err) return res.status(500).send(err);
            res.send('Student status updated');
        });
    });
});

// Re-enroll a student
app.put('/students/:id/reenroll', (req, res) => {
    const studentId = req.params.id;
    const { enrollment_date } = req.body;

    const range = 'student!A2:G';
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) return res.status(500).send(err);

        const rows = result.data.values;
        const rowIndex = rows.findIndex(row => row[0] == studentId);

        if (rowIndex === -1) {
            return res.status(404).send('Student not found');
        }

        rows[rowIndex][3] = enrollment_date;
        rows[rowIndex][6] = 'active';

        const updateRange = `student!A${rowIndex + 2}:G${rowIndex + 2}`;
        const resource = { values: [rows[rowIndex]] };

        sheets.spreadsheets.values.update({
            spreadsheetId,
            range: updateRange,
            valueInputOption: 'RAW',
            resource,
        }, (err, result) => {
            if (err) return res.status(500).send(err);
            res.send('Student re-enrolled');
        });
    });
});


// Route to get statistics for a specific student
app.get('/students/:id/stats', (req, res) => {
    const studentId = req.params.id;
    const range = 'student!A2:G'; 
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) {
            console.error('Error fetching data from Google Sheets:', err);
            return res.status(500).send('Error fetching data from Google Sheets');
        }
        if (!result.data.values) {
            console.error('No data found in Google Sheets');
            return res.status(500).send('No data found in Google Sheets');
        }
        const student = result.data.values.find(row => row[0] === studentId);
        if (!student) {
            return res.status(404).send('Student not found');
        }
        // Assuming you have additional sheets to fetch statistics data like exams, scores, etc.
        const statisticsRange = `student_statistic_specific!A2:C`; // Adjust this range based on your structure
        sheets.spreadsheets.values.get({ spreadsheetId, range: statisticsRange }, (err, statsResult) => {
            if (err) {
                console.error('Error fetching statistics from Google Sheets:', err);
                return res.status(500).send('Error fetching statistics from Google Sheets');
            }
            const statistics = statsResult.data.values ? statsResult.data.values.filter(row => row[0] === studentId) : [];
            res.json({ student, statistics });
        });
    });
});



// Get all classes
app.get('/classes', (req, res) => {
    const range = 'class!A2:G';
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) return res.status(500).send(err);
        res.json(result.data.values);
    });
});

// Add a new class
app.post('/addclasses', (req, res) => {
    
    const { school, year, semester, generation, schedule, status } = req.body;
    const range = 'class!A2:G';

    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) {
            console.error('Error fetching data from Google Sheets:', err);
            return res.status(500).send('Error fetching data from Google Sheets');
        }
        
    const classes = result.data.values || [];
    const existingClass = classes.find(classes => classes[1] === school && classes[2] === year && classes[3] === semester && classes[4] === generation && classes[5] === schedule);
    
    if (existingClass) {
        return res.status(400).send('Class with the same schedule and school already exists.');
    }

    // Extract existing IDs and determine the next unique 6-digit ID
    const existingIds = classes.map(classes => parseInt(classes[0]));
    const nextId = generateUniqueId(existingIds);
    
    const newRange = 'class!A:G';
    const values = [[nextId,  school, year, semester, generation, schedule, status || 'active']];
    const resource = { values };

    sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        resource,
    }, (err, result) => {
        if (err) return res.status(500).send(err);
        res.send('Class added');
    });
});
});
app.get('/classes/:id/activate', (req, res) => {
    const classId = req.params.id;
    const range = 'class!A2:G'; 
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
    if (err) {
        console.error('Error fetching data from Google Sheets:', err);
        return res.status(500).send('Error fetching data from Google Sheets');
    }    
    const rows = result.data.values
    const rowIndex = rows.findIndex(row => row[0] === classId);

    if (rows[rowIndex][6] === 'active'){
        return res.status(400).send('Class is already active')
    }
    rows[rowIndex][6] = 'active';

    const updateRange =  `class!A${rowIndex + 2}:G${rowIndex + 2}`;
    const resource = { values: [rows[rowIndex]] };

    sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: 'RAW',
        resource,
    }, (err, result) => {
        if (err) return res.status(500).send(err);
        res.send('Class Activated');
    });
})
})
app.get('/classes/:id/inactivate', (req, res) => {
    const classId = req.params.id;
    const range = 'class!A2:G'; 
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
    if (err) {
        console.error('Error fetching data from Google Sheets:', err);
        return res.status(500).send('Error fetching data from Google Sheets');
    }    
    const rows = result.data.values
    const rowIndex = rows.findIndex(row => row[0] === classId);

    if (rows[rowIndex][6] === 'inactive'){
        return res.status(400).send('Class is already inactive')
    }
    rows[rowIndex][6] = 'inactive';

    const updateRange =  `class!A${rowIndex + 2}:G${rowIndex + 2}`;
    const resource = { values: [rows[rowIndex]] };

    sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: 'RAW',
        resource,
    }, (err, result) => {
        if (err) return res.status(500).send(err);
        res.send('Class Inactivated');
    });
})
})


// Route to get statistics for a specific class
app.get('/classes/:id/stats', (req, res) => {
    const classId = req.params.id;
    const range = 'class!A2:G'; 
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) {
            console.error('Error fetching data from Google Sheets:', err);
            return res.status(500).send('Error fetching data from Google Sheets');
        }
        if (!result.data.values) {
            console.error('No data found in Google Sheets');
            return res.status(500).send('No data found in Google Sheets');
        }
        const classes = result.data.values.find(row => row[0] === classId);
        if (!classes) {
            return res.status(404).send('Class not found');
        }
        // Assuming you have additional sheets to fetch statistics data like exams, scores, etc.
        const statisticsRange = `class_statistic_specific!A2:C`; // Adjust this range based on your structure
        sheets.spreadsheets.values.get({ spreadsheetId, range: statisticsRange }, (err, statsResult) => {
            if (err) {
                console.error('Error fetching statistics from Google Sheets:', err);
                return res.status(500).send('Error fetching statistics from Google Sheets');
            }
            const statistics = statsResult.data.values ? statsResult.data.values.filter(row => row[0] === classId) : [];
            res.json({ classes, statistics });
        });
    });
});



// Route to enroll students in a class
app.post('/enroll', (req, res) => {
    const { student_id, class_id, enrollment_date } = req.body;
    const range = 'enrollment!A2:D';
    const range2 = 'student!A2:G';


    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) {
            console.error('Error fetching data from Google Sheets:', err);
            return res.status(500).send('Error fetching data from Google Sheets');
        }
        sheets.spreadsheets.values.get({ spreadsheetId, range: range2}, (err, result2) => {
            if (err) {
                console.error('Error fetching data from Google Sheets:', err);
                return res.status(500).send('Error fetching data from Google Sheets');
            }
            const studentExists = result2.data.values.some(student => student[0] === student_id);
            if (!studentExists) {
                return res.status(400).send('There is no student with that ID');
            }   
        
    const enrolls = result.data.values || [];
    // Use today's date as default if enrollment_date is not provided
    const currentDate = dayjs().format('YYYY-MM-DD');
    const enrollmentDate = enrollment_date || currentDate;

    const existingEnrollment = enrolls.find(enrollment => enrollment[1] === student_id && enrollment[2] === class_id);
        
        if (existingEnrollment) {
            return res.status(400).send('Enrollment with the same class and student already exists.');
        }

    // Extract existing IDs and determine the next unique 6-digit ID
    const existingIds = enrolls.map(enroll => parseInt(enroll[0]));
    const nextId = generateUniqueId(existingIds);

    const newRange = 'enrollment!A:D';
    const values =  [[nextId, student_id, class_id, enrollmentDate]];
    const resource = { values };

    // Append the new enrollment data to the sheet
    sheets.spreadsheets.values.append({
        spreadsheetId,
        range: newRange,
        valueInputOption: 'RAW',
        resource,
    }, (err, result) => {
        if (err) {
            console.error('Error appending data to Google Sheets:', err);
            return res.status(500).send('Error appending data to Google Sheets');
        }
        res.send('Students enrolled in class');
    });
});});        })


// Route to get all lectures for a class
app.get('/classes/:id/lectures', (req, res) => {
    const classId = req.params.id;
    const range = 'lecture!A2:D'; // Adjust the range based on your sheet structure
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) {
            console.error('Error fetching lectures from Google Sheets:', err);
            return res.status(500).send('Error fetching lectures from Google Sheets');
        }
        if (!result.data.values) {
            console.error('No data found in Google Sheets');
            return res.status(500).send('No data found in Google Sheets');
        }
        const lectures = result.data.values.filter(row => row[1] == classId);
        res.json(lectures);
    });
});

// Route to add a lecture to a class
app.post('/classes/:id/addlectures', (req, res) => {
    const classId = req.params.id;
    const {lecture_date, lecture_topic} = req.body;

    // Fetch existing lectures to determine the next available ID
    const range = 'lecture!A2:D'; // Fetch all lecture IDs
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) {
            console.error('Error fetching lectures from Google Sheets:', err);
            return res.status(500).send('Error fetching lectures from Google Sheets');
        }

        const lectures = result.data.values || [];
        const existingIds = lectures.map(lec => parseInt(lec[0]));
        const nextId = generateUniqueId(existingIds);

        const newRange = 'lecture!A:D';
        const values = [[nextId, classId, lecture_date, lecture_topic]];
        const resource = { values };

        // Append the new lecture data to the sheet
        sheets.spreadsheets.values.append({
            spreadsheetId,
            range: newRange,
            valueInputOption: 'RAW',
            resource,
        }, (err, result) => {
            if (err) {
                console.error('Error appending lecture to Google Sheets:', err);
                return res.status(500).send('Error appending lecture to Google Sheets');
            }
            res.send('Lecture added to class');
        });
    });
});

// Route to delete a lecture
app.delete('/lectures/:id', (req, res) => {
    const lectureId = req.params.id;

    // Fetch all lectures
    const range = 'lecture!A2:E';
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) {
            console.error('Error fetching lectures from Google Sheets:', err);
            return res.status(500).send('Error fetching lectures from Google Sheets');
        }

        const lectures = result.data.values || [];
        const lectureIndex = lectures.findIndex(lec => lec[0] == lectureId);

        if (lectureIndex === -1) {
            return res.status(404).send('Lecture not found');
        }

        lectures.splice(lectureIndex, 1); // Remove the lecture

        // Update the sheet without the deleted lecture
        sheets.spreadsheets.values.update({
            spreadsheetId,
            range: 'lecture!A2:E',
            valueInputOption: 'RAW',
            resource: { values: lectures }
        }, (err, result) => {
            if (err) {
                console.error('Error updating lectures in Google Sheets:', err);
                return res.status(500).send('Error updating lectures in Google Sheets');
            }
            res.send('Lecture deleted');
        });
    });
});

app.get('/class_management/class_stats/lectures/:id/loadattendance/:id2', (req, res) => {
    const lectureId = req.params.id;
    const studentId = req.params.id2;
    const range = 'attendance!A2:D';
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) return res.status(500).send(err);
                const data = result.data.values ? result.data.values.filter(row => row[1] === lectureId && row[2] === studentId) : [];
            res.json(data);
            })
    });

app.post('/class_management/class_stats/lectures/:id/attendance', (req, res) => {
    const lectureId = req.params.id;
    const { studentId, studentattendance} = req.body;  
    const range = 'attendance!A2:C';
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) {
            console.error('Error fetching attendance from Google Sheets:', err);
            return res.status(500).send('Error fetching attendance from Google Sheets');
        }
        const exist = result.data.values || [];
        const existingattendance = exist.find(attendance => attendance[1] === lectureId && attendance[2] === studentId);
        const existingIndex = exist.findIndex(attendance => attendance[1] === lectureId && attendance[2] === studentId);

        if (!existingattendance) {
            const existingIds = exist.map(lec => parseInt(lec[0]));
            const nextId = generateUniqueId(existingIds);
            newRange = 'attendance!A2:D';
            values = [[nextId, lectureId, studentId, studentattendance]];
            newresource = { values };

            sheets.spreadsheets.values.append({
                spreadsheetId,
                range: newRange,
                valueInputOption: 'RAW',
                resource: newresource,
            }, (err, result) => {
                if (err) {
                    console.error('Error appending data to Google Sheets:', err);
                    return res.status(600).send('Error appending data to Google Sheets');
                }
                res.send('Saved');
            });
        }

if(existingattendance){
    exist[existingIndex][3] = studentattendance;

    const updateRange =  `attendance!A${existingIndex + 2}:D${existingIndex + 2}`;
    const resource = { values: [exist[existingIndex]] };

    sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: 'RAW',
        resource,
    }, (err, result) => {
        if (err) return res.status(500).send(err);
        res.send('Saved');
    });}
})
})


app.post('/class_management/class_stats/lectures/:id/homework', (req, res) => {
    const lectureId = req.params.id;
    const { studentId, studentHomework} = req.body;  
    const range = 'homework!A2:C';
    sheets.spreadsheets.values.get({ spreadsheetId, range }, (err, result) => {
        if (err) {
            console.error('Error fetching attendance from Google Sheets:', err);
            return res.status(500).send('Error fetching attendance from Google Sheets');
        }
        const exist = result.data.values || [];
        const existingHomework = exist.find(homework => homework[1] === lectureId && homework[2] === studentId);
        const existingIndex = exist.findIndex(homework => homework[1] === lectureId && homework[2] === studentId);

        if (!existingHomework) {
            const existingIds = exist.map(lec => parseInt(lec[0]));
            const nextId = generateUniqueId(existingIds);
            newRange = 'homework!A2:D';
            values = [[nextId, lectureId, studentId, studentHomework]];
            newresource = { values };

            sheets.spreadsheets.values.append({
                spreadsheetId,
                range: newRange,
                valueInputOption: 'RAW',
                resource: newresource,
            }, (err, result) => {
                if (err) {
                    console.error('Error appending data to Google Sheets:', err);
                    return res.status(600).send('Error appending data to Google Sheets');
                }
                res.send('Saved');
            });
        }

if(existingHomework){
    exist[existingIndex][3] = studentHomework;

    const updateRange =  `homework!A${existingIndex + 2}:D${existingIndex + 2}`;
    const resource = { values: [exist[existingIndex]] };

    sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: 'RAW',
        resource,
    }, (err, result) => {
        if (err) return res.status(500).send(err);
        res.send('Saved');
    });}
})
})


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
