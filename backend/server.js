require('dotenv').config();

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');

const connectDB = require('./config/db');
const User = require('./models/User');

// =====================================================
// CONNECT TO DATABASE
// =====================================================

connectDB();

// =====================================================
// CREATE EXPRESS APP
// =====================================================

const app = express();
const server = http.createServer(app);

// =====================================================
// SOCKET.IO
// =====================================================

const io = socketIO(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});

// Make io available in routes
app.set('io', io);

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));

// =====================================================
// FRONTEND
// =====================================================

const frontendPath = path.join(
    __dirname,
    '../frontend'
);

app.use(
    express.static(frontendPath)
);

// =====================================================
// UPLOADS
// =====================================================

app.use(
    '/uploads',
    express.static(
        path.join(__dirname, 'uploads')
    )
);

// =====================================================
// API ROUTES
// =====================================================

app.use(
    '/api/auth',
    require('./routes/auth')
);

app.use(
    '/api/patient',
    require('./routes/patient')
);

app.use(
    '/api/emergency',
    require('./routes/emergency')
);

app.use(
    '/api/admin',
    require('./routes/admin')
);

// =====================================================
// HOSPITAL LIST (public - no auth needed)
// =====================================================

app.get('/api/hospitals', async (req, res) => {

    try {

        const Hospital = require('./models/Hospital');

        const hospitals = await Hospital.find({
            isActive: true
        }).select(
            'hospitalName address _id userId'
        );

        res.json({
            success: true,
            hospitals
        });

    } catch (error) {

        console.error(
            'Hospital fetch error:',
            error
        );

        res.status(500).json({
            success: false,
            message: 'Server error'
        });

    }

});

// =====================================================
// HOME PAGE
// =====================================================

// FIX: Send login page not dashboard
// http://localhost:3000/ will open customer login

app.get('/', (req, res) => {

    res.sendFile(
        path.join(
            frontendPath,
            'customer',
            'login.html'
        )
    );

});

// =====================================================
// SOCKET.IO CONNECTION
// =====================================================

io.on('connection', (socket) => {

    console.log(
        `Socket connected: ${socket.id}`
    );

    // -------------------------------------------------
    // JOIN ROOM
    // -------------------------------------------------

    socket.on('join_room', (data) => {

        try {

            const { role, userId } = data;

            if (role === 'ambulance') {

                socket.join('ambulance_room');

                console.log(
                    `Ambulance ${userId} joined ambulance_room`
                );

            } else if (role === 'customer') {

                socket.join(`patient_${userId}`);

                console.log(
                    `Patient ${userId} joined their room`
                );

            } else if (role === 'hospital') {

                socket.join(`hospital_${userId}`);

                console.log(
                    `Hospital ${userId} joined their room`
                );

            }

        } catch (error) {

            console.error('join_room error:', error);

        }

    });

    // -------------------------------------------------
    // ESP32 SENSOR DATA
    // -------------------------------------------------

    socket.on('esp32_data', (data) => {

        try {

            const { userId, heartRate, spO2 } = data;

            console.log(
                `ESP32 data from ${userId}: HR=${heartRate}, SpO2=${spO2}`
            );

            // Forward to patient dashboard
            io.to(`patient_${userId}`).emit(
                'sensor_data',
                { heartRate, spO2 }
            );

        } catch (error) {

            console.error('ESP32 data error:', error);

        }

    });

    // -------------------------------------------------
    // ACTIVATE BUZZER (from patient dashboard JS)
    // Forward the signal to ESP32 which is in same room
    // -------------------------------------------------

    socket.on('activate_buzzer', (data) => {

        try {

            const { userId, duration } = data;

            console.log(
                `Buzzer activation requested for patient ${userId}`
            );

            // Send to all sockets in patient room
            // ESP32 is also in this room so it will receive it
            io.to(`patient_${userId}`).emit(
                'trigger_buzzer',
                {
                    duration: duration || 10000,
                    message: 'Ambulance has arrived!'
                }
            );

        } catch (error) {

            console.error('activate_buzzer error:', error);

        }

    });

    // -------------------------------------------------
    // BUZZER TRIGGERED CONFIRMATION FROM ESP32
    // -------------------------------------------------

    socket.on('buzzer_triggered', (data) => {

        console.log(
            `Buzzer confirmed by ESP32 for patient: ${data.userId}`
        );

    });

    // -------------------------------------------------
    // DISCONNECT
    // -------------------------------------------------

    socket.on('disconnect', () => {

        console.log(
            `Socket disconnected: ${socket.id}`
        );

    });

});

// =====================================================
// DEFAULT ADMIN
// =====================================================

const createDefaultAdmin = async () => {

    try {

        const adminExists = await User.findOne({
            role: 'admin'
        });

        if (!adminExists) {

            await User.create({
                name: 'admin',
                password: 'admin123',
                role: 'admin'
            });

            console.log('');
            console.log('=============================');
            console.log(' Default admin created');
            console.log(' Username : admin');
            console.log(' Password : admin123');
            console.log(' CHANGE PASSWORD AFTER LOGIN');
            console.log('=============================');
            console.log('');

        } else {

            console.log('Admin account already exists');

        }

    } catch (error) {

        console.error(
            'Error creating default admin:',
            error
        );

    }

};

// =====================================================
// START SERVER
// =====================================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', async () => {

    console.log('');
    console.log('=============================');
    console.log(` MedAlert Server Started`);
    console.log(` Server listening on port ${PORT}`);
    console.log('=============================');
    console.log('');

    await createDefaultAdmin();

});