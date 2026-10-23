import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Header,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('plans')
  async getActivePlans() {
    return this.paymentsService.getActivePlans();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/plans')
  async getAllPlansForAdmin() {
    return this.paymentsService.getAllPlansForAdmin();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/plans')
  async createPlan(@Body() body: any) {
    return this.paymentsService.createPlan(body);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/plans/:id')
  async updatePlan(@Param('id') id: string, @Body() body: any) {
    return this.paymentsService.updatePlan(id, body);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('admin/plans/:id')
  async deletePlan(@Param('id') id: string) {
    return this.paymentsService.deletePlan(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('initiate')
  async initiatePayment(
    @Request() req: any,
    @Body('planId') planId: string,
    @Body('amountLYD') amountLYD?: number,
    @Body('points') points?: number,
  ) {
    return this.paymentsService.initiatePayment(req.user.id, planId, amountLYD, points);
  }

  @Post('webhook')
  async handleWebhook(@Body() body: any) {
    return this.paymentsService.handleWebhook(body);
  }

  @Get('redirect')
  @Header('Content-Type', 'text/html')
  async handleRedirect(@Query('customRef') customRef: string) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spurgo Payment Complete</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; padding: 40px 20px; background-color: #F9F9F9; color: #1A1A1A; }
    .card { background: white; border-radius: 24px; padding: 36px 24px; max-width: 420px; margin: 0 auto; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
    .icon { width: 72px; height: 72px; background: #FFF5EC; border-radius: 50%; color: #FF7A00; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 36px; }
    h2 { color: #1A1A1A; margin-bottom: 8px; }
    p { color: #666; font-size: 14px; margin-bottom: 24px; }
    .btn { background: #FF7A00; color: white; border: none; padding: 14px 28px; border-radius: 14px; font-weight: bold; font-size: 16px; cursor: pointer; text-decoration: none; display: inline-block; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h2>Payment Complete!</h2>
    <p>Your payment session (Reference: <strong>${customRef || 'N/A'}</strong>) has been completed.</p>
    <p>Points have been credited to your account.</p>
    <a href="spurgo://payment-result?ref=${customRef}" class="btn">Return to Spurgo App</a>
  </div>
  <script>
    setTimeout(function() {
      window.location.href = "spurgo://payment-result?ref=${customRef}";
    }, 1500);
  </script>
</body>
</html>
    `;
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('status/:customRef')
  async getStatus(@Request() req: any, @Param('customRef') customRef: string) {
    return this.paymentsService.getTransactionStatus(customRef, req.user.id);
  }
}
