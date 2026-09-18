const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Hospital = require('../models/Hospital');
const Patient = require('../models/Patient');
const Emergency = require('../models/Emergency');
const { protect, authorize } = require('../middleware/auth');

// All admin routes are protected
router.use(protect);
router.use(authorize('admin'));

// @route   POST /api/admin/create-user
// @desc    Create a new user (customer, ambulance, hospital)
router.post('/create-user', async (req, res) => {
  try {
    const { name, password, role, hospitalName, address, contactNumber } =
      req.body;

    if (!name || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Name, password and role are required'
      });
    }

    const allowedRoles = ['customer', 'ambulance', 'hospital'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be customer, ambulance, or hospital'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ name, role });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: `A ${role} with this name already exists`
      });
    }

    const user = await User.create({
      name,
      password,
      role,
      hospitalName: role === 'hospital' ? hospitalName || name : null
    });

    // If hospital, create hospital record
    if (role === 'hospital') {
      await Hospital.create({
        userId: user._id,
        hospitalName: hospitalName || name,
        address: address || '',
        contactNumber: contactNumber || ''
      });
    }

    res.status(201).json({
      success: true,
      message: `${role} account created successfully`,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        hospitalName: user.hospitalName,
        isActive: user.isActive,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   GET /api/admin/users/:role
// @desc    Get all users by role
router.get('/users/:role', async (req, res) => {
  try {
    const { role } = req.params;
    const users = await User.find({ role }).select('-password').sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users (except admin)
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'admin' } })
      .select('-password')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/admin/users/:id/toggle-status
// @desc    Activate or deactivate user
router.put('/users/:id/toggle-status', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role === 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify admin account'
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: user.isActive
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/admin/users/:id
// @desc    Delete a user
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role === 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete admin account'
      });
    }

    await User.deleteOne({ _id: req.params.id });

    // If hospital, remove hospital record too
    if (user.role === 'hospital') {
      await Hospital.deleteOne({ userId: req.params.id });
    }

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/admin/users/:id/reset-password
// @desc    Reset user password
router.put('/users/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 4 characters'
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.password = newPassword;
    await user.save(); // Pre-save hook will hash it

    res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/admin/hospitals
// @desc    Get all registered hospitals (for dropdown in setup)
router.get('/hospitals', async (req, res) => {
  try {
    const hospitals = await Hospital.find({ isActive: true }).populate(
      'userId',
      'name isActive'
    );

    res.status(200).json({
      success: true,
      hospitals
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/admin/emergencies
// @desc    Get all emergencies (for admin overview)
router.get('/emergencies', async (req, res) => {
  try {
    const emergencies = await Emergency.find().sort({ createdAt: -1 }).limit(50);

    res.status(200).json({
      success: true,
      count: emergencies.length,
      emergencies
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/admin/stats
// @desc    Dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const [customers, ambulances, hospitals, activeEmergencies, totalEmergencies] =
      await Promise.all([
        User.countDocuments({ role: 'customer' }),
        User.countDocuments({ role: 'ambulance' }),
        User.countDocuments({ role: 'hospital' }),
        Emergency.countDocuments({ status: { $ne: 'completed' } }),
        Emergency.countDocuments()
      ]);

    res.status(200).json({
      success: true,
      stats: {
        customers,
        ambulances,
        hospitals,
        activeEmergencies,
        totalEmergencies
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/admin/hospitals-list
// @desc    Public hospital list for patient setup page
router.get('/hospitals-list', async (req, res) => {
  try {
    const hospitals = await Hospital.find().select('hospitalName address');

    res.status(200).json({
      success: true,
      hospitals
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;