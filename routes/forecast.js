const express = require('express');
const router = express.Router();

// Ruta de ejemplo para pronósticos
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Ruta de pronósticos funcionando',
    data: []
  });
});

module.exports = router;