const service = require('../services/dashboard.service');

exports.summary = async (req, res, next) => {
  try { res.json(await service.getSummary(req.session.user.establishmentId)); }
  catch (e) { next(e); }
};
