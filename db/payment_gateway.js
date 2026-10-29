/**
 * FOGONAZO OS - Payment Gateway Interface & Providers
 * Arquitectura desacoplada e intercambiable para cobro con tarjeta, Bizum y pasarelas bancarias.
 */

class PaymentGateway {
  /**
   * Procesa el cobro de una comanda
   * @param {Object} params
   * @param {number} params.amountCents - Importe total en céntimos (entero)
   * @param {string} params.currency - Moneda ('EUR', '€')
   * @param {string} params.orderId - Identificador interno de la comanda
   * @param {string} params.method - 'tarjeta', 'bizum', 'efectivo'
   * @param {Object} params.details - Datos de la tarjeta (tokenizado) o teléfono Bizum
   * @returns {Promise<{success: boolean, transactionId: string, isDemo: boolean, message: string}>}
   */
  async processPayment(params) {
    throw new Error('El método processPayment debe ser implementado por el proveedor específico.');
  }

  /**
   * Reembolsa o cancela un cobro
   */
  async refundPayment(transactionId, amountCents) {
    throw new Error('El método refundPayment debe ser implementado por el proveedor específico.');
  }
}

/**
 * Proveedor DEMO de Fogonazo
 * Simula validaciones bancarias instantáneas con trazabilidad sin cargos monetarios reales.
 */
class MockPaymentGateway extends PaymentGateway {
  constructor(options = {}) {
    super();
    this.name = 'MockPaymentGateway (Fogonazo Demo)';
    this.delayMs = options.delayMs || 300;
  }

  async processPayment({ amountCents, currency = '€', orderId, method = 'tarjeta', details = {} }) {
    // Simula una breve latencia de comunicación con la pasarela bancaria
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    if (!amountCents || amountCents <= 0) {
      return {
        success: false,
        transactionId: null,
        isDemo: true,
        error: 'El importe a cobrar debe ser mayor que cero.'
      };
    }

    // Genera identificador de transacción simulada
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const transactionId = `TX_DEMO_${Date.now()}_${randomSuffix}`;

    return {
      success: true,
      transactionId,
      isDemo: true,
      provider: this.name,
      method,
      amountCents,
      currency,
      timestamp: new Date().toISOString(),
      message: 'DEMO: Operación simulada con éxito. No se ha realizado ningún cobro real.'
    };
  }

  async refundPayment(transactionId, amountCents) {
    return {
      success: true,
      refundId: `REF_DEMO_${Date.now()}`,
      originalTransaction: transactionId,
      amountCents,
      isDemo: true,
      message: 'DEMO: Reembolso simulado completado.'
    };
  }
}

/**
 * Factoría para resolver la pasarela activa
 */
class PaymentGatewayFactory {
  static getGateway(provider = 'demo') {
    switch (provider.toLowerCase()) {
      case 'demo':
      default:
        return new MockPaymentGateway();
    }
  }
}

module.exports = {
  PaymentGateway,
  MockPaymentGateway,
  PaymentGatewayFactory
};
