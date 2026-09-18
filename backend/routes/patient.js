const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Patient = require('../models/Patient');
const { protect, authorize } = require('../middleware/auth');

// Multer storage setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    if (extname) {
      return cb(null, true);
    }
    cb(new Error('Only images and documents are allowed'));
  }
});

// @route   POST /api/patient/setup
// @desc    Save patient profile info
router.post(
  '/setup',
  protect,
  authorize('customer'),
  upload.array('healthDocuments', 10),
  async (req, res) => {
    try {
      const {
        name,
        age,
        gender,
        address,
        previousHealthProblems,
        previousSurgeries,
        livingWith,
        emergencyContact,
        hospitalPreferences
      } = req.body;

      // Process uploaded files
      const healthDocuments = req.files
        ? req.files.map((file) => ({
            filename: file.filename,
            originalName: file.originalname
          }))
        : [];

      // Parse hospital preferences
      let parsedPreferences = [];
      if (hospitalPreferences) {
        parsedPreferences =
          typeof hospitalPreferences === 'string'
            ? JSON.parse(hospitalPreferences)
            : hospitalPreferences;
      }

      // Check if patient profile already exists
      let patient = await Patient.findOne({ userId: req.user.id });

      if (patient) {
        // Update existing
        patient.name = name;
        patient.age = age;
        patient.gender = gender;
        patient.address = address;
        patient.previousHealthProblems = previousHealthProblems || '';
        patient.previousSurgeries = previousSurgeries || '';
        patient.livingWith = livingWith;
        patient.emergencyContact = emergencyContact;
        patient.hospitalPreferences = parsedPreferences;
        patient.updatedAt = Date.now();

        if (healthDocuments.length > 0) {
          patient.healthDocuments.push(...healthDocuments);
        }

        await patient.save();
      } else {
        // Create new
        patient = await Patient.create({
          userId: req.user.id,
          name,
          age,
          gender,
          address,
          previousHealthProblems: previousHealthProblems || '',
          previousSurgeries: previousSurgeries || '',
          livingWith,
          emergencyContact,
          hospitalPreferences: parsedPreferences,
          healthDocuments
        });
      }

      res.status(200).json({
        success: true,
        message: 'Patient profile saved successfully',
        patient
      });
    } catch (error) {
      console.error('Patient setup error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Server error during setup'
      });
    }
  }
);

// @route   GET /api/patient/profile
// @desc    Get patient profile
router.get('/profile', protect, authorize('customer'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ userId: req.user.id });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient profile not found'
      });
    }

    res.status(200).json({
      success: true,
      patient
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/patient/profile/:patientId
// @desc    Get patient profile by ID (for ambulance and hospital)
router.get(
  '/profile/:patientId',
  protect,
  authorize('ambulance', 'hospital', 'admin'),
  async (req, res) => {
    try {
      const patient = await Patient.findById(req.params.patientId);

      if (!patient) {
        return res.status(404).json({
          success: false,
          message: 'Patient not found'
        });
      }

      res.status(200).json({
        success: true,
        patient
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
);

// @route   GET /api/patient/documents/:filename
// @desc    Serve uploaded documents
router.get('/documents/:filename', protect, (req, res) => {
  const filePath = path.join(__dirname, '../uploads', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ success: false, message: 'File not found' });
  }
});

module.exports = router;