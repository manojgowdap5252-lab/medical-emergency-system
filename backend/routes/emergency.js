const express  = require('express');
const router   = express.Router();
const Emergency = require('../models/Emergency');
const Patient  = require('../models/Patient');
const { protect, authorize } = require('../middleware/auth');

// =====================================================
// POST /api/emergency/trigger
// =====================================================

router.post(
  '/trigger',
  protect,
  authorize('customer'),
  async (req, res) => {
    try {

      const { condition, bpValue, heartRate } = req.body;

      console.log('=== EMERGENCY TRIGGER ===');
      console.log('Patient user ID :', req.user.id);
      console.log('Condition       :', condition);
      console.log('Heart Rate      :', heartRate);
      console.log('BP Value        :', bpValue);

      const patient = await Patient.findOne({ userId: req.user.id });

      console.log('Patient found   :', patient ? 'YES' : 'NO');

      if (!patient) {
        console.log('ERROR: Patient profile not found');
        return res.status(404).json({
          success: false,
          message: 'Patient profile not found. Please complete setup first.'
        });
      }

      console.log('Patient name    :', patient.name);
      console.log('Patient address :', patient.address);

      const existing = await Emergency.findOne({
        patientUserId: req.user.id,
        status: { $nin: ['completed'] }
      });

      console.log('Existing emergency:', existing ? existing._id : 'NONE');

      if (existing) {
  console.log('Existing emergency found:', existing._id);

  // Re-notify ambulances in case they missed it
  const io = req.app.get('io');
  const ambulanceSockets = await io.in('ambulance_room').fetchSockets();
  console.log('Re-notifying ambulances:', ambulanceSockets.length);

  io.to('ambulance_room').emit('new_emergency', {
    emergencyId:    existing._id,
    patientName:    existing.patientName,
    patientAddress: existing.patientAddress,
    condition:      existing.condition,
    bpValue:        existing.bpValue,
    heartRate:      existing.heartRate,
    createdAt:      existing.createdAt
  });

  return res.status(200).json({
    success: true,
    message: 'Emergency already active - ambulances re-notified',
    emergency: existing
  });
}
      console.log('Creating new emergency...');

      const emergency = await Emergency.create({
        patientId:      patient._id,
        patientUserId:  req.user.id,
        patientName:    patient.name,
        patientAddress: patient.address,
        condition:      condition || 'cardiac_emergency',
        bpValue:        bpValue   || 0,
        heartRate:      heartRate || 0
      });

      console.log('Emergency created:', emergency._id);
      console.log('Notifying ambulances...');

      const io = req.app.get('io');

      const ambulanceRoomSockets = await io.in('ambulance_room').fetchSockets();
      console.log('Ambulances online:', ambulanceRoomSockets.length);

      io.to('ambulance_room').emit('new_emergency', {
        emergencyId:    emergency._id,
        patientName:    emergency.patientName,
        patientAddress: emergency.patientAddress,
        condition:      emergency.condition,
        bpValue:        emergency.bpValue,
        heartRate:      emergency.heartRate,
        createdAt:      emergency.createdAt
      });

      console.log('Ambulance notification sent');
      console.log('=========================');

      res.status(201).json({
        success: true,
        message: 'Emergency triggered successfully',
        emergency
      });

    } catch (error) {
      console.error('=== EMERGENCY TRIGGER ERROR ===');
      console.error('Error name    :', error.name);
      console.error('Error message :', error.message);
      console.error('Full error    :', error);
      console.error('===============================');
      res.status(500).json({
        success: false,
        message: 'Server error: ' + error.message
      });
    }
  }
);

// =====================================================
// GET /api/emergency/active
// =====================================================

router.get(
  '/active',
  protect,
  authorize('ambulance', 'admin'),
  async (req, res) => {
    try {

      const emergencies = await Emergency.find({
        status: 'pending'
      }).sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        count: emergencies.length,
        emergencies
      });

    } catch (error) {
      console.error('Get active emergencies error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
);

// =====================================================
// GET /api/emergency/my-active
// =====================================================

router.get(
  '/my-active',
  protect,
  authorize('customer'),
  async (req, res) => {
    try {

      const emergency = await Emergency.findOne({
        patientUserId: req.user.id,
        status: { $nin: ['completed'] }
      }).sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        emergency: emergency || null
      });

    } catch (error) {
      console.error('Get my active emergency error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
);

// =====================================================
// PUT /api/emergency/:id/accept
// =====================================================

router.put(
  '/:id/accept',
  protect,
  authorize('ambulance'),
  async (req, res) => {
    try {

      console.log('Accept emergency:', req.params.id);
      console.log('Ambulance:', req.user.name);

      const emergency = await Emergency.findById(req.params.id);

      if (!emergency) {
        return res.status(404).json({
          success: false,
          message: 'Emergency not found'
        });
      }

      if (emergency.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'This emergency has already been assigned'
        });
      }

      emergency.status        = 'ambulance_assigned';
      emergency.ambulanceId   = req.user.id;
      emergency.ambulanceName = req.user.name;
      emergency.updatedAt     = Date.now();
      await emergency.save();

      const patient = await Patient.findById(emergency.patientId);

      const io = req.app.get('io');

      io.to(`patient_${emergency.patientUserId}`).emit('ambulance_coming', {
        message:       'Ambulance is on the way!',
        ambulanceName: req.user.name
      });

      io.to('ambulance_room').emit('emergency_taken', {
        emergencyId: emergency._id
      });

      console.log('Emergency accepted by:', req.user.name);

      res.status(200).json({
        success: true,
        message: 'Emergency accepted',
        emergency,
        patient
      });

    } catch (error) {
      console.error('Accept emergency error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error: ' + error.message
      });
    }
  }
);

// =====================================================
// PUT /api/emergency/:id/arrived
// =====================================================

router.put(
  '/:id/arrived',
  protect,
  authorize('ambulance'),
  async (req, res) => {
    try {

      console.log('Arrived at location:', req.params.id);

      const emergency = await Emergency.findById(req.params.id);

      if (!emergency) {
        return res.status(404).json({
          success: false,
          message: 'Emergency not found'
        });
      }

      emergency.status    = 'ambulance_arrived';
      emergency.updatedAt = Date.now();
      await emergency.save();

      const io = req.app.get('io');

      io.to(`patient_${emergency.patientUserId}`).emit('trigger_buzzer', {
        duration: 10000,
        message:  'Ambulance has arrived at your location!'
      });

      console.log('Buzzer triggered for patient:', emergency.patientUserId);

      res.status(200).json({
        success: true,
        message: 'Arrival confirmed and buzzer triggered'
      });

    } catch (error) {
      console.error('Arrived error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error: ' + error.message
      });
    }
  }
);

// =====================================================
// PUT /api/emergency/:id/patient-picked
// =====================================================

router.put(
  '/:id/patient-picked',
  protect,
  authorize('ambulance'),
  async (req, res) => {
    try {

      console.log('Patient picked:', req.params.id);

      const emergency = await Emergency.findById(req.params.id);

      if (!emergency) {
        return res.status(404).json({
          success: false,
          message: 'Emergency not found'
        });
      }

      emergency.status    = 'patient_picked';
      emergency.updatedAt = Date.now();
      await emergency.save();

      const patient = await Patient.findById(emergency.patientId);

      console.log('Patient picked confirmed');

      res.status(200).json({
        success: true,
        message: 'Patient picked up confirmed',
        emergency,
        patient
      });

    } catch (error) {
      console.error('Patient picked error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error: ' + error.message
      });
    }
  }
);

// =====================================================
// PUT /api/emergency/:id/heading-hospital
// =====================================================

// =====================================================
// PUT /api/emergency/:id/heading-hospital
// =====================================================

router.put(
  '/:id/heading-hospital',
  protect,
  authorize('ambulance'),
  async (req, res) => {
    try {

      const { hospitalId, hospitalName } = req.body;

      console.log('=== HEADING HOSPITAL ===');
      console.log('Emergency ID  :', req.params.id);
      console.log('Hospital ID   :', hospitalId);
      console.log('Hospital Name :', hospitalName);

      if (!hospitalId || !hospitalName) {
        return res.status(400).json({
          success: false,
          message: 'hospitalId and hospitalName are required'
        });
      }

      const emergency = await Emergency.findById(req.params.id);

      if (!emergency) {
        return res.status(404).json({
          success: false,
          message: 'Emergency not found'
        });
      }

      // Find the hospital to get the correct userId
      // The hospitalId from frontend might be Hospital._id
      // We need the userId to send socket to correct room
      const Hospital = require('../models/Hospital');

      let hospitalUserId = hospitalId; // Default assume it is userId

      // Try to find hospital by _id first
      const hospitalDoc = await Hospital.findById(hospitalId);

      if (hospitalDoc) {
        // hospitalId was Hospital._id so get the userId
        hospitalUserId = hospitalDoc.userId;
        console.log('Found hospital doc. userId:', hospitalUserId);
      } else {
        // Try finding by userId
        const hospitalByUser = await Hospital.findOne({ userId: hospitalId });
        if (hospitalByUser) {
          hospitalUserId = hospitalId;
          console.log('Hospital found by userId:', hospitalUserId);
        } else {
          console.log('Hospital not found in DB. Using ID as-is:', hospitalId);
        }
      }

      // Update emergency
      emergency.status               = 'heading_to_hospital';
      emergency.selectedHospitalId   = hospitalId;
      emergency.selectedHospitalName = hospitalName;
      emergency.updatedAt            = Date.now();
      await emergency.save();

      const patient = await Patient.findById(emergency.patientId);

      const io = req.app.get('io');

      // Check who is in hospital room
      const hospitalRoom = await io.in(`hospital_${hospitalUserId}`).fetchSockets();
      console.log(`Hospital room hospital_${hospitalUserId} has ${hospitalRoom.length} connections`);

      // Also check original hospitalId room just in case
      const hospitalRoom2 = await io.in(`hospital_${hospitalId}`).fetchSockets();
      console.log(`Hospital room hospital_${hospitalId} has ${hospitalRoom2.length} connections`);

      // Send to both room variants to be safe
      const patientData = {
        emergencyId:    emergency._id,
        patientName:    emergency.patientName,
        patientAddress: emergency.patientAddress,
        condition:      emergency.condition,
        bpValue:        emergency.bpValue,
        heartRate:      emergency.heartRate,
        patientId:      emergency.patientId,
        patientDetails: patient
      };

      io.to(`hospital_${hospitalUserId}`).emit('patient_incoming', patientData);
      io.to(`hospital_${hospitalId}`).emit('patient_incoming', patientData);

      console.log('Notification sent to hospital rooms');

      // Notify patient
      io.to(`patient_${emergency.patientUserId}`).emit('info_sent_to_hospital', {
        hospitalName,
        message: `Your information has been sent to ${hospitalName}`
      });

      console.log('=== HEADING HOSPITAL DONE ===');

      res.status(200).json({
        success: true,
        message: `Heading to hospital: ${hospitalName}`,
        emergency
      });

    } catch (error) {
      console.error('Heading hospital error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error: ' + error.message
      });
    }
  }
);

// =====================================================
// PUT /api/emergency/:id/complete
// =====================================================

router.put(
  '/:id/complete',
  protect,
  authorize('ambulance'),
  async (req, res) => {
    try {

      console.log('Completing emergency:', req.params.id);

      const emergency = await Emergency.findById(req.params.id);

      if (!emergency) {
        return res.status(404).json({
          success: false,
          message: 'Emergency not found'
        });
      }

      emergency.status    = 'completed';
      emergency.updatedAt = Date.now();
      await emergency.save();

      console.log('Emergency completed');

      res.status(200).json({
        success: true,
        message: 'Emergency completed successfully'
      });

    } catch (error) {
      console.error('Complete error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error: ' + error.message
      });
    }
  }
);

// =====================================================
// EXPORT
// =====================================================

module.exports = router;