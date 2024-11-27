import {
	BadRequestException,
	Body,
	Controller,
	HttpStatus,
	InternalServerErrorException,
	Logger,
	Param,
	Post,
	Res,
	UploadedFiles,
	UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ValidationError } from 'ajv/dist/2019';
import { Response } from 'express';

import { InvoiceService } from './invoice.service';
import { MappingService } from '../mapping/mapping.service';

@ApiTags('invoice')
@Controller('invoice')
export class InvoiceController {
	constructor(
		private readonly invoiceService: InvoiceService,
		private readonly mappingService: MappingService,
		private readonly logger: Logger,
	) {}

	@Post('transform-and-create/:format')
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		required: true,
		schema: {
			type: 'object',
			properties: {
				data: {
					type: 'string',
					format: 'binary',
					description: 'The spreadsheet to be transformed.',
				},
				mapping: {
					type: 'string',
					format: 'binary',
					description:
						'The mapping from spreadsheet data to the internal format as YAML or JSON.',
				},
				pdf: {
					type: 'string',
					format: 'binary',
					nullable: true,
					description:
						'Optional PDF version of the invoice.  For Factur-X/ZUGFeRD, if no PDF is uploaded, one is generated from the Spreadsheet with the help of LibreOffice.',
				},
				attachment: {
					type: 'array',
					nullable: true,
					description: 'An arbitrary number of supplementary attachments',
					items: {
						type: 'string',
						format: 'binary',
						description: 'The individual attachment',
					},
				},
				description: {
					type: 'array',
					nullable: true,
					description:
						'Optional descriptions for each supplementary attachment',
					items: {
						type: 'string',
						description: 'Description for the corresponding attachment',
					},
				},
				mimeType: {
					type: 'array',
					nullable: true,
					description: 'Optional MIME types for each supplementary attachment',
					items: {
						type: 'string',
						description: 'MIME type for the corresponding attachment',
					},
				},
			},
		},
	})
	@ApiResponse({
		status: 201,
		description:
			'Creation successful. The output is an invoice' +
			' document as either XML or PDF.',
	})
	@ApiResponse({
		status: 400,
		description: 'Bad request with error details',
	})
	@UseInterceptors(
		FileFieldsInterceptor([
			{ name: 'data', maxCount: 1 },
			{ name: 'mapping', maxCount: 1 },
			{ name: 'pdf', maxCount: 1 },
			{ name: 'attachment' }, // FIXME! How to set maxCount asynchronously?
		]),
	)
	transformAndCreate(
		@Res() response: Response,
		@Param('format') format: string,
		@UploadedFiles()
		files: {
			data?: Express.Multer.File[];
			mapping?: Express.Multer.File[];
			pdf?: Express.Multer.File[];
			attachment?: Express.Multer.File[];
		},

		@Body() body: { description?: string[]; mimeType?: string[] },
	) {
		const { data, mapping } = files;

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const descriptions = body.description || [];
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const mimeTypes = body.mimeType || [];

		if (!data) {
			throw new BadRequestException('No invoice file uploaded');
		}

		if (!mapping) {
			throw new BadRequestException('No mapping file uploaded');
		}

		try {
			const invoice = this.mappingService.transform(
				format,
				mapping[0].buffer.toString(),
				data[0].buffer,
			);

			const document = this.invoiceService.generate(invoice, {
				format,
			});
			if (typeof document === 'string') {
				response.set('Content-Type', 'application/xml');
			} else {
				response.set('Content-Type', 'application/pdf');
			}
			response.status(HttpStatus.CREATED).send(document);
		} catch (error) {
			if (error instanceof ValidationError) {
				throw new BadRequestException({
					message: 'Transformation failed.',
					details: error,
				});
			} else {
				this.logger.error(`unknown error: ${error.message}\n${error.stack}`);
				throw new InternalServerErrorException();
			}
		}
	}
}
