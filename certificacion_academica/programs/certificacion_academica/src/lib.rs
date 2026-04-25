use anchor_lang::prelude::*;

declare_id!("VJR5z3nvSGYQgXE6aMi8o6R4voUctBNPTmGqzvWRDc2");

const MAX_NOMBRE_INSTITUCION: usize = 128;
const MAX_PAIS: usize = 64;
const MAX_TIPO_CREDENCIAL: usize = 32;
const MAX_NOMBRE_PROGRAMA: usize = 128;
const MAX_URI_DOCUMENTO: usize = 256;
const MAX_MOTIVO_REVOCACION: usize = 256;
const MAX_CODIGO_REGISTRO: usize = 40;
const MAX_TITULAR_NOMBRE: usize = 80;
const MAX_TITULAR_APELLIDO: usize = 80;
const MAX_TITULAR_DOCUMENTO: usize = 24;
const MAX_TRAZABILIDAD: usize = 1024;
const MAX_ROLE_NOMBRE: usize = 120;
const MAX_ROLE_ENTIDAD: usize = 160;
const MAX_ROLE_DOCUMENTO: usize = 40;
const MAX_ROLE_EMAIL: usize = 120;
const MAX_ROLE_MOTIVO: usize = 180;
const MAX_UNIVERSIDAD_SOLICITUD: usize = 160;
const MAX_CARRERA_SOLICITUD: usize = 160;
const MAX_PLAN_SOLICITUD: usize = 160;
const MAX_MATRICULA_SOLICITUD: usize = 80;
const MAX_TOKEN_TITULO: usize = 160;
const MAX_REQUEST_METADATA: usize = 512;

#[program]
pub mod certificacion_academica {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.credential_counter = 0;
        config.role_request_counter = 0;
        config.bump = ctx.bumps.config;
        emit!(ProgramaInicializado {
            authority: config.authority,
        });
        Ok(())
    }

    pub fn register_institution(
        ctx: Context<RegisterInstitution>,
        institution_wallet: Pubkey,
        name: String,
        country: String,
    ) -> Result<()> {
        let signer = ctx.accounts.authority.key();
        let autorizado = signer == ctx.accounts.config.authority
            || (ctx.accounts.authority_role_assignment.wallet == signer
                && ctx.accounts.authority_role_assignment.active
                && ctx.accounts.authority_role_assignment.role == UserRole::Universidad
                && signer == institution_wallet);
        require!(autorizado, ErrorCertificacion::NoAutorizado);

        require!(
            name.len() <= MAX_NOMBRE_INSTITUCION,
            ErrorCertificacion::NombreInstitucionMuyLargo
        );
        require!(
            country.len() <= MAX_PAIS,
            ErrorCertificacion::PaisMuyLargo
        );

        let institution = &mut ctx.accounts.institution;
        institution.wallet = institution_wallet;
        institution.name = name;
        institution.country = country;
        institution.is_active = true;
        institution.created_at = Clock::get()?.unix_timestamp;
        institution.bump = ctx.bumps.institution;

        emit!(InstitucionRegistrada {
            institution: institution.wallet,
            nombre: institution.name.clone(),
            pais: institution.country.clone(),
            activa: institution.is_active,
        });
        Ok(())
    }

    pub fn set_institution_status(ctx: Context<SetInstitutionStatus>, is_active: bool) -> Result<()> {
        let institution = &mut ctx.accounts.institution;
        institution.is_active = is_active;

        emit!(EstadoInstitucionActualizado {
            institution: institution.wallet,
            activa: institution.is_active,
        });
        Ok(())
    }

    pub fn issue_credential(
        ctx: Context<IssueCredential>,
        credential_id: u64,
        recipient: Pubkey,
        credential_type: String,
        program_name: String,
        issue_date: i64,
        expiry_date: i64,
        document_hash: [u8; 32],
        document_uri: String,
    ) -> Result<()> {
        validar_campos_credencial(
            &credential_type,
            &program_name,
            &document_uri,
            issue_date,
            expiry_date,
        )?;

        let config = &mut ctx.accounts.config;
        require!(
            credential_id == config.credential_counter.saturating_add(1),
            ErrorCertificacion::IdCredencialInvalido
        );

        let institution = &ctx.accounts.institution;
        require!(institution.is_active, ErrorCertificacion::InstitucionInactiva);

        let credential = &mut ctx.accounts.credential;
        credential.credential_id = credential_id;
        credential.issuer = ctx.accounts.issuer.key();
        credential.recipient = recipient;
        credential.credential_type = credential_type;
        credential.program_name = program_name;
        credential.issue_date = issue_date;
        credential.expiry_date = expiry_date;
        credential.document_hash = document_hash;
        credential.document_uri = document_uri;
        credential.status = CredentialStatus::Issued;
        credential.replaced_by = None;
        credential.revoked_reason = String::new();
        credential.registry_code = String::new();
        credential.holder_name = String::new();
        credential.holder_last_name = String::new();
        credential.holder_document = String::new();
        credential.institution_name = institution.name.clone();
        credential.traceability_json = String::new();
        credential.bump = ctx.bumps.credential;

        config.credential_counter = credential_id;

        emit!(CredencialEmitida {
            credential_id,
            issuer: credential.issuer,
            recipient: credential.recipient,
            tipo: credential.credential_type.clone(),
        });
        Ok(())
    }

    pub fn assign_token_to_graduate(
        ctx: Context<IssueCredential>,
        credential_id: u64,
        recipient: Pubkey,
        credential_type: String,
        program_name: String,
        issue_date: i64,
        expiry_date: i64,
        document_hash: [u8; 32],
        document_uri: String,
    ) -> Result<()> {
        issue_credential(
            ctx,
            credential_id,
            recipient,
            credential_type,
            program_name,
            issue_date,
            expiry_date,
            document_hash,
            document_uri,
        )
    }

    pub fn set_credential_metadata(
        ctx: Context<SetCredentialMetadata>,
        _credential_id: u64,
        registry_code: String,
        holder_name: String,
        holder_last_name: String,
        holder_document: String,
        institution_name: String,
        traceability_json: String,
    ) -> Result<()> {
        require!(
            !registry_code.trim().is_empty() && registry_code.len() <= MAX_CODIGO_REGISTRO,
            ErrorCertificacion::CodigoRegistroInvalido
        );
        require!(
            !holder_name.trim().is_empty() && holder_name.len() <= MAX_TITULAR_NOMBRE,
            ErrorCertificacion::TitularInvalido
        );
        require!(
            !holder_last_name.trim().is_empty() && holder_last_name.len() <= MAX_TITULAR_APELLIDO,
            ErrorCertificacion::TitularInvalido
        );
        require!(
            !holder_document.trim().is_empty() && holder_document.len() <= MAX_TITULAR_DOCUMENTO,
            ErrorCertificacion::TitularInvalido
        );
        require!(
            !institution_name.trim().is_empty() && institution_name.len() <= MAX_NOMBRE_INSTITUCION,
            ErrorCertificacion::NombreInstitucionMuyLargo
        );
        require!(
            traceability_json.len() <= MAX_TRAZABILIDAD,
            ErrorCertificacion::TrazabilidadMuyLarga
        );

        let credential = &mut ctx.accounts.credential;
        require!(
            credential.status == CredentialStatus::Issued,
            ErrorCertificacion::EstadoCredencialInvalido
        );

        credential.registry_code = registry_code;
        credential.holder_name = holder_name;
        credential.holder_last_name = holder_last_name;
        credential.holder_document = holder_document;
        credential.institution_name = institution_name;
        credential.traceability_json = traceability_json;

        Ok(())
    }

    pub fn update_certification(
        ctx: Context<SetCredentialMetadata>,
        credential_id: u64,
        registry_code: String,
        holder_name: String,
        holder_last_name: String,
        holder_document: String,
        institution_name: String,
        traceability_json: String,
    ) -> Result<()> {
        set_credential_metadata(
            ctx,
            credential_id,
            registry_code,
            holder_name,
            holder_last_name,
            holder_document,
            institution_name,
            traceability_json,
        )
    }

    pub fn revoke_credential(
        ctx: Context<RevokeCredential>,
        _credential_id: u64,
        reason: String,
    ) -> Result<()> {
        require!(
            reason.len() <= MAX_MOTIVO_REVOCACION,
            ErrorCertificacion::MotivoRevocacionMuyLargo
        );
        require!(
            !reason.trim().is_empty(),
            ErrorCertificacion::MotivoRevocacionVacio
        );

        let credential = &mut ctx.accounts.credential;
        require!(
            credential.status == CredentialStatus::Issued,
            ErrorCertificacion::EstadoCredencialInvalido
        );

        credential.status = CredentialStatus::Revoked;
        credential.revoked_reason = reason;

        emit!(CredencialRevocada {
            credential_id: credential.credential_id,
            issuer: credential.issuer,
            motivo: credential.revoked_reason.clone(),
        });

        Ok(())
    }

    pub fn revoke_certification(
        ctx: Context<RevokeCredential>,
        credential_id: u64,
        reason: String,
    ) -> Result<()> {
        revoke_credential(ctx, credential_id, reason)
    }

    pub fn reissue_credential(
        ctx: Context<ReissueCredential>,
        old_credential_id: u64,
        new_credential_id: u64,
        recipient: Pubkey,
        credential_type: String,
        program_name: String,
        issue_date: i64,
        expiry_date: i64,
        document_hash: [u8; 32],
        document_uri: String,
    ) -> Result<()> {
        validar_campos_credencial(
            &credential_type,
            &program_name,
            &document_uri,
            issue_date,
            expiry_date,
        )?;

        let config = &mut ctx.accounts.config;
        require!(
            new_credential_id == config.credential_counter.saturating_add(1),
            ErrorCertificacion::IdCredencialInvalido
        );
        require!(
            new_credential_id > old_credential_id,
            ErrorCertificacion::IdCredencialInvalido
        );

        let old_credential = &mut ctx.accounts.old_credential;
        require!(
            old_credential.status == CredentialStatus::Issued,
            ErrorCertificacion::EstadoCredencialInvalido
        );

        let new_credential = &mut ctx.accounts.new_credential;
        new_credential.credential_id = new_credential_id;
        new_credential.issuer = ctx.accounts.issuer.key();
        new_credential.recipient = recipient;
        new_credential.credential_type = credential_type;
        new_credential.program_name = program_name;
        new_credential.issue_date = issue_date;
        new_credential.expiry_date = expiry_date;
        new_credential.document_hash = document_hash;
        new_credential.document_uri = document_uri;
        new_credential.status = CredentialStatus::Issued;
        new_credential.replaced_by = None;
        new_credential.revoked_reason = String::new();
        new_credential.registry_code = old_credential.registry_code.clone();
        new_credential.holder_name = old_credential.holder_name.clone();
        new_credential.holder_last_name = old_credential.holder_last_name.clone();
        new_credential.holder_document = old_credential.holder_document.clone();
        new_credential.institution_name = old_credential.institution_name.clone();
        new_credential.traceability_json = old_credential.traceability_json.clone();
        new_credential.bump = ctx.bumps.new_credential;

        old_credential.status = CredentialStatus::Reissued;
        old_credential.replaced_by = Some(new_credential_id);

        config.credential_counter = new_credential_id;

        emit!(CredencialReemitida {
            old_credential_id,
            new_credential_id,
            issuer: new_credential.issuer,
        });

        Ok(())
    }

    pub fn request_role(
        ctx: Context<RequestRole>,
        wallet: Pubkey,
        request_id: u64,
        role_code: u8,
        nombre: String,
        entidad: String,
        documento: String,
        email: String,
    ) -> Result<()> {
        let role = parse_role(role_code)?;
        require!(wallet == ctx.accounts.authority.key(), ErrorCertificacion::WalletSolicitanteInvalida);
        require!(role != UserRole::Admin, ErrorCertificacion::RolNoPermitido);
        require!(nombre.len() <= MAX_ROLE_NOMBRE, ErrorCertificacion::DatosRolInvalidos);
        require!(entidad.len() <= MAX_ROLE_ENTIDAD, ErrorCertificacion::DatosRolInvalidos);
        require!(documento.len() <= MAX_ROLE_DOCUMENTO, ErrorCertificacion::DatosRolInvalidos);
        require!(email.len() <= MAX_ROLE_EMAIL, ErrorCertificacion::DatosRolInvalidos);
        require!(!nombre.trim().is_empty(), ErrorCertificacion::DatosRolInvalidos);
        require!(!entidad.trim().is_empty(), ErrorCertificacion::DatosRolInvalidos);
        require!(!documento.trim().is_empty(), ErrorCertificacion::DatosRolInvalidos);
        require!(!email.trim().is_empty(), ErrorCertificacion::DatosRolInvalidos);

        let config = &mut ctx.accounts.config;
        require!(
            request_id == config.role_request_counter.saturating_add(1),
            ErrorCertificacion::SolicitudRolInvalida
        );

        let role_request = &mut ctx.accounts.role_request;
        role_request.request_id = request_id;
        role_request.wallet = wallet;
        role_request.role_requested = role;
        role_request.nombre = nombre;
        role_request.entidad = entidad;
        role_request.documento = documento;
        role_request.email = email;
        role_request.status = RoleRequestStatus::Pending;
        role_request.requested_at = Clock::get()?.unix_timestamp;
        role_request.resolved_at = 0;
        role_request.resolved_by = Pubkey::default();
        role_request.resolution_reason = String::new();
        role_request.bump = ctx.bumps.role_request;

        config.role_request_counter = request_id;

        emit!(SolicitudRolRegistrada {
            request_id,
            wallet,
            role: role_request.role_requested.clone(),
        });

        Ok(())
    }

    pub fn resolve_role_request(
        ctx: Context<ResolveRoleRequest>,
        _request_id: u64,
        action: u8,
        reason: String,
    ) -> Result<()> {
        let signer = ctx.accounts.authority.key();
        let autorizado = signer == ctx.accounts.config.authority
            || (ctx.accounts.authority_role_assignment.wallet == signer
                && ctx.accounts.authority_role_assignment.active
                && ctx.accounts.authority_role_assignment.role == UserRole::Admin);
        require!(autorizado, ErrorCertificacion::NoAutorizado);

        require!(reason.len() <= MAX_ROLE_MOTIVO, ErrorCertificacion::DatosRolInvalidos);
        let role_request = &mut ctx.accounts.role_request;
        require!(
            role_request.status == RoleRequestStatus::Pending,
            ErrorCertificacion::SolicitudRolInvalida
        );

        let now = Clock::get()?.unix_timestamp;
        role_request.resolved_at = now;
        role_request.resolved_by = ctx.accounts.authority.key();
        role_request.resolution_reason = reason;

        match action {
            1 => {
                role_request.status = RoleRequestStatus::Approved;
                let role_assignment = &mut ctx.accounts.role_assignment;
                role_assignment.wallet = role_request.wallet;
                role_assignment.role = role_request.role_requested.clone();
                role_assignment.active = true;
                role_assignment.assigned_by = ctx.accounts.authority.key();
                role_assignment.updated_at = now;
                role_assignment.bump = ctx.bumps.role_assignment;

                emit!(RolActualizado {
                    wallet: role_assignment.wallet,
                    role: role_assignment.role.clone(),
                    active: role_assignment.active,
                });
            }
            2 => {
                role_request.status = RoleRequestStatus::Rejected;
            }
            _ => return err!(ErrorCertificacion::AccionSolicitudInvalida),
        }

        Ok(())
    }

    pub fn upsert_role(
        ctx: Context<UpsertRole>,
        wallet: Pubkey,
        role_code: u8,
        active: bool,
    ) -> Result<()> {
        let signer = ctx.accounts.authority.key();
        let autorizado = signer == ctx.accounts.config.authority
            || (ctx.accounts.authority_role_assignment.wallet == signer
                && ctx.accounts.authority_role_assignment.active
                && ctx.accounts.authority_role_assignment.role == UserRole::Admin);
        require!(autorizado, ErrorCertificacion::NoAutorizado);

        let role = parse_role(role_code)?;
        let role_assignment = &mut ctx.accounts.role_assignment;
        role_assignment.wallet = wallet;
        role_assignment.role = role;
        role_assignment.active = active;
        role_assignment.assigned_by = ctx.accounts.authority.key();
        role_assignment.updated_at = Clock::get()?.unix_timestamp;
        role_assignment.bump = ctx.bumps.role_assignment;

        emit!(RolActualizado {
            wallet: role_assignment.wallet,
            role: role_assignment.role.clone(),
            active: role_assignment.active,
        });

        Ok(())
    }

    pub fn request_tokens(
        ctx: Context<RequestTokens>,
        request_id: u64,
        solicitante_wallet: Pubkey,
        universidad: String,
        carrera: String,
        plan_estudio: String,
        matricula: String,
        anio: u16,
        cantidad_egresados: u32,
    ) -> Result<()> {
        let signer = ctx.accounts.authority.key();
        let autorizado = signer == ctx.accounts.config.authority
            || (ctx.accounts.authority_role_assignment.wallet == signer
                && ctx.accounts.authority_role_assignment.active
                && ctx.accounts.authority_role_assignment.role == UserRole::Universidad
                && signer == solicitante_wallet);
        require!(autorizado, ErrorCertificacion::NoAutorizado);

        require!(universidad.len() <= MAX_UNIVERSIDAD_SOLICITUD, ErrorCertificacion::DatosTokenInvalidos);
        require!(carrera.len() <= MAX_CARRERA_SOLICITUD, ErrorCertificacion::DatosTokenInvalidos);
        require!(plan_estudio.len() <= MAX_PLAN_SOLICITUD, ErrorCertificacion::DatosTokenInvalidos);
        require!(matricula.len() <= MAX_MATRICULA_SOLICITUD, ErrorCertificacion::DatosTokenInvalidos);
        require!(!universidad.trim().is_empty(), ErrorCertificacion::DatosTokenInvalidos);
        require!(!carrera.trim().is_empty(), ErrorCertificacion::DatosTokenInvalidos);
        require!(!plan_estudio.trim().is_empty(), ErrorCertificacion::DatosTokenInvalidos);
        require!(!matricula.trim().is_empty(), ErrorCertificacion::DatosTokenInvalidos);
        require!(anio >= 1950, ErrorCertificacion::DatosTokenInvalidos);
        require!(cantidad_egresados > 0, ErrorCertificacion::DatosTokenInvalidos);

        let req = &mut ctx.accounts.ministry_request;
        req.request_id = request_id;
        req.request_type = MinistryRequestType::Tokens;
        req.solicitante_wallet = solicitante_wallet;
        req.universidad = universidad;
        req.carrera = carrera;
        req.plan_estudio = plan_estudio;
        req.matricula = matricula;
        req.anio = anio;
        req.cantidad_egresados = cantidad_egresados;
        req.status = MinistryRequestStatus::Pending;
        req.reviewed_by = Pubkey::default();
        req.resolution_reason = String::new();
        req.token_id = 0;
        req.secondary_token_id = 0;
        req.metadata_json = String::new();
        req.created_at = Clock::get()?.unix_timestamp;
        req.updated_at = req.created_at;
        req.bump = ctx.bumps.ministry_request;

        emit!(SolicitudMinisterioRegistrada {
            request_id,
            request_type: req.request_type.clone(),
            solicitante_wallet,
        });

        Ok(())
    }

    pub fn approve_token_request(
        ctx: Context<ApproveTokenRequest>,
        _request_id: u64,
        token_id: u64,
        titulo: String,
    ) -> Result<()> {
        let signer = ctx.accounts.authority.key();
        let autorizado = signer == ctx.accounts.config.authority
            || (ctx.accounts.authority_role_assignment.wallet == signer
                && ctx.accounts.authority_role_assignment.active
                && ctx.accounts.authority_role_assignment.role == UserRole::Ministerio);
        require!(autorizado, ErrorCertificacion::NoAutorizado);

        require!(titulo.len() <= MAX_TOKEN_TITULO, ErrorCertificacion::DatosTokenInvalidos);
        require!(!titulo.trim().is_empty(), ErrorCertificacion::DatosTokenInvalidos);

        let req = &mut ctx.accounts.ministry_request;
        require!(req.request_type == MinistryRequestType::Tokens, ErrorCertificacion::SolicitudMinisterioInvalida);
        require!(req.status == MinistryRequestStatus::Pending, ErrorCertificacion::SolicitudMinisterioInvalida);

        req.status = MinistryRequestStatus::Approved;
        req.reviewed_by = signer;
        req.resolution_reason = String::new();
        req.token_id = token_id;
        req.secondary_token_id = 0;
        req.updated_at = Clock::get()?.unix_timestamp;

        let token = &mut ctx.accounts.certification_token;
        token.token_id = token_id;
        token.request_id = req.request_id;
        token.universidad_wallet = req.solicitante_wallet;
        token.universidad = req.universidad.clone();
        token.titulo = titulo;
        token.anio = req.anio;
        token.status = CertificationTokenStatus::Disponible;
        token.cantidad_total = req.cantidad_egresados;
        token.cantidad_disponible = req.cantidad_egresados;
        token.creado_por = signer;
        token.fecha_creacion = Clock::get()?.unix_timestamp;
        token.bump = ctx.bumps.certification_token;

        emit!(SolicitudMinisterioResuelta {
            request_id: req.request_id,
            status: req.status.clone(),
            reviewed_by: signer,
        });

        emit!(TokenCertificacionCreado {
            token_id,
            universidad_wallet: token.universidad_wallet,
            cantidad_total: token.cantidad_total,
        });

        Ok(())
    }

    pub fn reject_token_request(
        ctx: Context<RejectTokenRequest>,
        _request_id: u64,
        reason: String,
    ) -> Result<()> {
        let signer = ctx.accounts.authority.key();
        let autorizado = signer == ctx.accounts.config.authority
            || (ctx.accounts.authority_role_assignment.wallet == signer
                && ctx.accounts.authority_role_assignment.active
                && ctx.accounts.authority_role_assignment.role == UserRole::Ministerio);
        require!(autorizado, ErrorCertificacion::NoAutorizado);

        require!(reason.len() <= MAX_ROLE_MOTIVO, ErrorCertificacion::DatosTokenInvalidos);

        let req = &mut ctx.accounts.ministry_request;
        require!(req.request_type == MinistryRequestType::Tokens, ErrorCertificacion::SolicitudMinisterioInvalida);
        require!(req.status == MinistryRequestStatus::Pending, ErrorCertificacion::SolicitudMinisterioInvalida);

        req.status = MinistryRequestStatus::Rejected;
        req.reviewed_by = signer;
        req.resolution_reason = reason;
        req.updated_at = Clock::get()?.unix_timestamp;

        emit!(SolicitudMinisterioResuelta {
            request_id: req.request_id,
            status: req.status.clone(),
            reviewed_by: signer,
        });

        Ok(())
    }

    pub fn request_foreign_title(
        ctx: Context<RequestForeignTitle>,
        request_id: u64,
        solicitante_wallet: Pubkey,
        metadata_json: String,
    ) -> Result<()> {
        let signer = ctx.accounts.authority.key();
        let autorizado = signer == ctx.accounts.config.authority
            || (ctx.accounts.authority_role_assignment.wallet == signer
                && ctx.accounts.authority_role_assignment.active
                && ctx.accounts.authority_role_assignment.role == UserRole::Egresado
                && signer == solicitante_wallet);
        require!(autorizado, ErrorCertificacion::NoAutorizado);
        require!(!metadata_json.trim().is_empty(), ErrorCertificacion::DatosTokenInvalidos);
        require!(metadata_json.len() <= MAX_REQUEST_METADATA, ErrorCertificacion::DatosTokenInvalidos);

        let req = &mut ctx.accounts.ministry_request;
        req.request_id = request_id;
        req.request_type = MinistryRequestType::ForeignTitle;
        req.solicitante_wallet = solicitante_wallet;
        req.universidad = String::new();
        req.carrera = String::new();
        req.plan_estudio = String::new();
        req.matricula = String::new();
        req.anio = 0;
        req.cantidad_egresados = 0;
        req.status = MinistryRequestStatus::Pending;
        req.reviewed_by = Pubkey::default();
        req.resolution_reason = String::new();
        req.token_id = 0;
        req.secondary_token_id = 0;
        req.metadata_json = metadata_json;
        req.created_at = Clock::get()?.unix_timestamp;
        req.updated_at = req.created_at;
        req.bump = ctx.bumps.ministry_request;

        emit!(SolicitudMinisterioRegistrada {
            request_id,
            request_type: req.request_type.clone(),
            solicitante_wallet,
        });

        Ok(())
    }

    pub fn request_foreign_certification(
        ctx: Context<RequestForeignTitle>,
        request_id: u64,
        solicitante_wallet: Pubkey,
        metadata_json: String,
    ) -> Result<()> {
        request_foreign_title(ctx, request_id, solicitante_wallet, metadata_json)
    }

    pub fn process_foreign_title(
        ctx: Context<ProcessForeignTitle>,
        _request_id: u64,
        action: u8,
        token_ministerio_id: u64,
        reason: String,
    ) -> Result<()> {
        let signer = ctx.accounts.authority.key();
        let autorizado = signer == ctx.accounts.config.authority
            || (ctx.accounts.authority_role_assignment.wallet == signer
                && ctx.accounts.authority_role_assignment.active
                && ctx.accounts.authority_role_assignment.role == UserRole::Ministerio);
        require!(autorizado, ErrorCertificacion::NoAutorizado);

        let req = &mut ctx.accounts.ministry_request;
        require!(req.request_type == MinistryRequestType::ForeignTitle, ErrorCertificacion::SolicitudMinisterioInvalida);
        require!(req.status == MinistryRequestStatus::Pending, ErrorCertificacion::SolicitudMinisterioInvalida);
        require!(reason.len() <= MAX_ROLE_MOTIVO, ErrorCertificacion::DatosTokenInvalidos);

        match action {
            1 => {
                req.status = MinistryRequestStatus::SentToCancilleria;
                req.token_id = token_ministerio_id;
                req.resolution_reason = reason;
            }
            2 => {
                req.status = MinistryRequestStatus::Rejected;
                req.resolution_reason = reason;
            }
            _ => return err!(ErrorCertificacion::AccionSolicitudInvalida),
        }

        req.reviewed_by = signer;
        req.updated_at = Clock::get()?.unix_timestamp;

        emit!(SolicitudMinisterioResuelta {
            request_id: req.request_id,
            status: req.status.clone(),
            reviewed_by: signer,
        });

        Ok(())
    }

    pub fn send_to_cancilleria(
        ctx: Context<ProcessForeignTitle>,
        request_id: u64,
        token_ministerio_id: u64,
        reason: String,
    ) -> Result<()> {
        process_foreign_title(ctx, request_id, 1, token_ministerio_id, reason)
    }

    pub fn finalize_foreign_title(
        ctx: Context<ApproveApostille>,
        request_id: u64,
        token_cancilleria_id: u64,
        reason: String,
    ) -> Result<()> {
        approve_apostille(ctx, request_id, 1, token_cancilleria_id, reason)
    }

    pub fn approve_apostille(
        ctx: Context<ApproveApostille>,
        _request_id: u64,
        action: u8,
        token_cancilleria_id: u64,
        reason: String,
    ) -> Result<()> {
        let signer = ctx.accounts.authority.key();
        let autorizado = signer == ctx.accounts.config.authority
            || (ctx.accounts.authority_role_assignment.wallet == signer
                && ctx.accounts.authority_role_assignment.active
                && ctx.accounts.authority_role_assignment.role == UserRole::Cancilleria);
        require!(autorizado, ErrorCertificacion::NoAutorizado);

        let req = &mut ctx.accounts.ministry_request;
        require!(req.request_type == MinistryRequestType::ForeignTitle, ErrorCertificacion::SolicitudMinisterioInvalida);
        require!(req.status == MinistryRequestStatus::SentToCancilleria, ErrorCertificacion::SolicitudMinisterioInvalida);
        require!(reason.len() <= MAX_ROLE_MOTIVO, ErrorCertificacion::DatosTokenInvalidos);

        match action {
            1 => {
                req.status = MinistryRequestStatus::Finalized;
                req.secondary_token_id = token_cancilleria_id;
                req.resolution_reason = reason;
            }
            2 => {
                req.status = MinistryRequestStatus::Rejected;
                req.resolution_reason = reason;
            }
            _ => return err!(ErrorCertificacion::AccionSolicitudInvalida),
        }

        req.reviewed_by = signer;
        req.updated_at = Clock::get()?.unix_timestamp;

        emit!(SolicitudMinisterioResuelta {
            request_id: req.request_id,
            status: req.status.clone(),
            reviewed_by: signer,
        });

        Ok(())
    }

    pub fn reject_apostille(
        ctx: Context<ApproveApostille>,
        request_id: u64,
        reason: String,
    ) -> Result<()> {
        approve_apostille(ctx, request_id, 2, 0, reason)
    }
}

fn validar_campos_credencial(
    credential_type: &str,
    program_name: &str,
    document_uri: &str,
    issue_date: i64,
    expiry_date: i64,
) -> Result<()> {
    require!(
        credential_type.len() <= MAX_TIPO_CREDENCIAL,
        ErrorCertificacion::TipoCredencialMuyLargo
    );
    require!(
        program_name.len() <= MAX_NOMBRE_PROGRAMA,
        ErrorCertificacion::NombreProgramaMuyLargo
    );
    require!(
        document_uri.len() <= MAX_URI_DOCUMENTO,
        ErrorCertificacion::UriDocumentoMuyLarga
    );
    require!(
        expiry_date == 0 || expiry_date >= issue_date,
        ErrorCertificacion::FechaExpiracionInvalida
    );

    Ok(())
}

fn parse_role(value: u8) -> Result<UserRole> {
    match value {
        1 => Ok(UserRole::Admin),
        2 => Ok(UserRole::Universidad),
        3 => Ok(UserRole::Ministerio),
        4 => Ok(UserRole::Cancilleria),
        5 => Ok(UserRole::Egresado),
        _ => err!(ErrorCertificacion::RolNoPermitido),
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = ProgramConfig::SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(institution_wallet: Pubkey, _name: String, _country: String)]
pub struct RegisterInstitution<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        init,
        payer = authority,
        space = Institution::SPACE,
        seeds = [b"institution", institution_wallet.as_ref()],
        bump
    )]
    pub institution: Account<'info, Institution>,
    #[account(
        init_if_needed,
        payer = authority,
        space = RoleAssignment::SPACE,
        seeds = [b"role_assignment", authority.key().as_ref()],
        bump
    )]
    pub authority_role_assignment: Account<'info, RoleAssignment>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetInstitutionStatus<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(mut, seeds = [b"institution", institution.wallet.as_ref()], bump = institution.bump)]
    pub institution: Account<'info, Institution>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(credential_id: u64)]
pub struct IssueCredential<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        seeds = [b"institution", issuer.key().as_ref()],
        bump = institution.bump,
        constraint = institution.wallet == issuer.key() @ ErrorCertificacion::InstitucionNoCorrespondeAlEmisor
    )]
    pub institution: Account<'info, Institution>,
    #[account(
        init,
        payer = issuer,
        space = Credential::SPACE,
        seeds = [b"credential", issuer.key().as_ref(), &credential_id.to_le_bytes()],
        bump
    )]
    pub credential: Account<'info, Credential>,
    #[account(mut)]
    pub issuer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(credential_id: u64)]
pub struct SetCredentialMetadata<'info> {
    #[account(
        seeds = [b"institution", issuer.key().as_ref()],
        bump = institution.bump,
        constraint = institution.wallet == issuer.key() @ ErrorCertificacion::InstitucionNoCorrespondeAlEmisor
    )]
    pub institution: Account<'info, Institution>,
    #[account(
        mut,
        seeds = [b"credential", issuer.key().as_ref(), &credential_id.to_le_bytes()],
        bump = credential.bump,
        constraint = credential.issuer == issuer.key() @ ErrorCertificacion::NoAutorizado
    )]
    pub credential: Account<'info, Credential>,
    pub issuer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(credential_id: u64)]
pub struct RevokeCredential<'info> {
    #[account(
        seeds = [b"institution", issuer.key().as_ref()],
        bump = institution.bump,
        constraint = institution.wallet == issuer.key() @ ErrorCertificacion::InstitucionNoCorrespondeAlEmisor
    )]
    pub institution: Account<'info, Institution>,
    #[account(
        mut,
        seeds = [b"credential", issuer.key().as_ref(), &credential_id.to_le_bytes()],
        bump = credential.bump,
        constraint = credential.issuer == issuer.key() @ ErrorCertificacion::NoAutorizado
    )]
    pub credential: Account<'info, Credential>,
    pub issuer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(old_credential_id: u64, new_credential_id: u64)]
pub struct ReissueCredential<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        seeds = [b"institution", issuer.key().as_ref()],
        bump = institution.bump,
        constraint = institution.wallet == issuer.key() @ ErrorCertificacion::InstitucionNoCorrespondeAlEmisor,
        constraint = institution.is_active @ ErrorCertificacion::InstitucionInactiva
    )]
    pub institution: Account<'info, Institution>,
    #[account(
        mut,
        seeds = [b"credential", issuer.key().as_ref(), &old_credential_id.to_le_bytes()],
        bump = old_credential.bump,
        constraint = old_credential.issuer == issuer.key() @ ErrorCertificacion::NoAutorizado
    )]
    pub old_credential: Account<'info, Credential>,
    #[account(
        init,
        payer = issuer,
        space = Credential::SPACE,
        seeds = [b"credential", issuer.key().as_ref(), &new_credential_id.to_le_bytes()],
        bump
    )]
    pub new_credential: Account<'info, Credential>,
    #[account(mut)]
    pub issuer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey, request_id: u64)]
pub struct RequestRole<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        init,
        payer = authority,
        space = RoleRequest::SPACE,
        seeds = [b"role_request", wallet.as_ref(), &request_id.to_le_bytes()],
        bump
    )]
    pub role_request: Account<'info, RoleRequest>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(request_id: u64)]
pub struct ResolveRoleRequest<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        mut,
        seeds = [b"role_request", role_request.wallet.as_ref(), &request_id.to_le_bytes()],
        bump = role_request.bump
    )]
    pub role_request: Account<'info, RoleRequest>,
    #[account(
        init_if_needed,
        payer = authority,
        space = RoleAssignment::SPACE,
        seeds = [b"role_assignment", role_request.wallet.as_ref()],
        bump
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
    #[account(
        seeds = [b"role_assignment", authority.key().as_ref()],
        bump = authority_role_assignment.bump
    )]
    pub authority_role_assignment: Account<'info, RoleAssignment>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct UpsertRole<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        init_if_needed,
        payer = authority,
        space = RoleAssignment::SPACE,
        seeds = [b"role_assignment", wallet.as_ref()],
        bump
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
    #[account(
        init_if_needed,
        payer = authority,
        space = RoleAssignment::SPACE,
        seeds = [b"role_assignment", authority.key().as_ref()],
        bump
    )]
    pub authority_role_assignment: Account<'info, RoleAssignment>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(request_id: u64, solicitante_wallet: Pubkey)]
pub struct RequestTokens<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        init,
        payer = authority,
        space = MinistryRequest::SPACE,
        seeds = [b"ministry_request", solicitante_wallet.as_ref(), &request_id.to_le_bytes()],
        bump
    )]
    pub ministry_request: Account<'info, MinistryRequest>,
    #[account(
        init_if_needed,
        payer = authority,
        space = RoleAssignment::SPACE,
        seeds = [b"role_assignment", authority.key().as_ref()],
        bump
    )]
    pub authority_role_assignment: Account<'info, RoleAssignment>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(request_id: u64, token_id: u64)]
pub struct ApproveTokenRequest<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        mut,
        seeds = [b"ministry_request", ministry_request.solicitante_wallet.as_ref(), &request_id.to_le_bytes()],
        bump = ministry_request.bump
    )]
    pub ministry_request: Account<'info, MinistryRequest>,
    #[account(
        init,
        payer = authority,
        space = CertificationToken::SPACE,
        seeds = [b"certification_token", ministry_request.solicitante_wallet.as_ref(), &token_id.to_le_bytes()],
        bump
    )]
    pub certification_token: Account<'info, CertificationToken>,
    #[account(
        init_if_needed,
        payer = authority,
        space = RoleAssignment::SPACE,
        seeds = [b"role_assignment", authority.key().as_ref()],
        bump
    )]
    pub authority_role_assignment: Account<'info, RoleAssignment>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(request_id: u64)]
pub struct RejectTokenRequest<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        mut,
        seeds = [b"ministry_request", ministry_request.solicitante_wallet.as_ref(), &request_id.to_le_bytes()],
        bump = ministry_request.bump
    )]
    pub ministry_request: Account<'info, MinistryRequest>,
    #[account(
        init_if_needed,
        payer = authority,
        space = RoleAssignment::SPACE,
        seeds = [b"role_assignment", authority.key().as_ref()],
        bump
    )]
    pub authority_role_assignment: Account<'info, RoleAssignment>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(request_id: u64, solicitante_wallet: Pubkey)]
pub struct RequestForeignTitle<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        init,
        payer = authority,
        space = MinistryRequest::SPACE,
        seeds = [b"ministry_request", solicitante_wallet.as_ref(), &request_id.to_le_bytes()],
        bump
    )]
    pub ministry_request: Account<'info, MinistryRequest>,
    #[account(
        init_if_needed,
        payer = authority,
        space = RoleAssignment::SPACE,
        seeds = [b"role_assignment", authority.key().as_ref()],
        bump
    )]
    pub authority_role_assignment: Account<'info, RoleAssignment>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(request_id: u64)]
pub struct ProcessForeignTitle<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        mut,
        seeds = [b"ministry_request", ministry_request.solicitante_wallet.as_ref(), &request_id.to_le_bytes()],
        bump = ministry_request.bump
    )]
    pub ministry_request: Account<'info, MinistryRequest>,
    #[account(
        init_if_needed,
        payer = authority,
        space = RoleAssignment::SPACE,
        seeds = [b"role_assignment", authority.key().as_ref()],
        bump
    )]
    pub authority_role_assignment: Account<'info, RoleAssignment>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(request_id: u64)]
pub struct ApproveApostille<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(
        mut,
        seeds = [b"ministry_request", ministry_request.solicitante_wallet.as_ref(), &request_id.to_le_bytes()],
        bump = ministry_request.bump
    )]
    pub ministry_request: Account<'info, MinistryRequest>,
    #[account(
        init_if_needed,
        payer = authority,
        space = RoleAssignment::SPACE,
        seeds = [b"role_assignment", authority.key().as_ref()],
        bump
    )]
    pub authority_role_assignment: Account<'info, RoleAssignment>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum CredentialStatus {
    Issued,
    Revoked,
    Reissued,
    Expired,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum UserRole {
    Admin,
    Universidad,
    Ministerio,
    Cancilleria,
    Egresado,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum RoleRequestStatus {
    Pending,
    Approved,
    Rejected,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum MinistryRequestType {
    Tokens,
    ForeignTitle,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum MinistryRequestStatus {
    Pending,
    Approved,
    Rejected,
    SentToCancilleria,
    Finalized,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum CertificationTokenStatus {
    Disponible,
    Asignado,
    Revocado,
}

#[account]
pub struct ProgramConfig {
    pub authority: Pubkey,
    pub credential_counter: u64,
    pub role_request_counter: u64,
    pub bump: u8,
}

impl ProgramConfig {
    pub const SPACE: usize = 8 + 32 + 8 + 8 + 1;
}

#[account]
pub struct Institution {
    pub wallet: Pubkey,
    pub name: String,
    pub country: String,
    pub is_active: bool,
    pub created_at: i64,
    pub bump: u8,
}

impl Institution {
    pub const SPACE: usize = 8 + 32 + (4 + MAX_NOMBRE_INSTITUCION) + (4 + MAX_PAIS) + 1 + 8 + 1;
}

#[account]
pub struct Credential {
    pub credential_id: u64,
    pub issuer: Pubkey,
    pub recipient: Pubkey,
    pub credential_type: String,
    pub program_name: String,
    pub issue_date: i64,
    pub expiry_date: i64,
    pub document_hash: [u8; 32],
    pub document_uri: String,
    pub status: CredentialStatus,
    pub replaced_by: Option<u64>,
    pub revoked_reason: String,
    pub registry_code: String,
    pub holder_name: String,
    pub holder_last_name: String,
    pub holder_document: String,
    pub institution_name: String,
    pub traceability_json: String,
    pub bump: u8,
}

impl Credential {
    pub const SPACE: usize = 8
        + 8
        + 32
        + 32
        + (4 + MAX_TIPO_CREDENCIAL)
        + (4 + MAX_NOMBRE_PROGRAMA)
        + 8
        + 8
        + 32
        + (4 + MAX_URI_DOCUMENTO)
        + 1
        + (1 + 8)
        + (4 + MAX_MOTIVO_REVOCACION)
        + (4 + MAX_CODIGO_REGISTRO)
        + (4 + MAX_TITULAR_NOMBRE)
        + (4 + MAX_TITULAR_APELLIDO)
        + (4 + MAX_TITULAR_DOCUMENTO)
        + (4 + MAX_NOMBRE_INSTITUCION)
        + (4 + MAX_TRAZABILIDAD)
        + 1;
}

#[account]
pub struct RoleAssignment {
    pub wallet: Pubkey,
    pub role: UserRole,
    pub active: bool,
    pub assigned_by: Pubkey,
    pub updated_at: i64,
    pub bump: u8,
}

impl RoleAssignment {
    pub const SPACE: usize = 8 + 32 + 1 + 1 + 32 + 8 + 1;
}

#[account]
pub struct RoleRequest {
    pub request_id: u64,
    pub wallet: Pubkey,
    pub role_requested: UserRole,
    pub nombre: String,
    pub entidad: String,
    pub documento: String,
    pub email: String,
    pub status: RoleRequestStatus,
    pub requested_at: i64,
    pub resolved_at: i64,
    pub resolved_by: Pubkey,
    pub resolution_reason: String,
    pub bump: u8,
}

impl RoleRequest {
    pub const SPACE: usize = 8
        + 8
        + 32
        + 1
        + (4 + MAX_ROLE_NOMBRE)
        + (4 + MAX_ROLE_ENTIDAD)
        + (4 + MAX_ROLE_DOCUMENTO)
        + (4 + MAX_ROLE_EMAIL)
        + 1
        + 8
        + 8
        + 32
        + (4 + MAX_ROLE_MOTIVO)
        + 1;
}

#[account]
pub struct MinistryRequest {
    pub request_id: u64,
    pub request_type: MinistryRequestType,
    pub solicitante_wallet: Pubkey,
    pub universidad: String,
    pub carrera: String,
    pub plan_estudio: String,
    pub matricula: String,
    pub anio: u16,
    pub cantidad_egresados: u32,
    pub status: MinistryRequestStatus,
    pub reviewed_by: Pubkey,
    pub resolution_reason: String,
    pub token_id: u64,
    pub secondary_token_id: u64,
    pub metadata_json: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

impl MinistryRequest {
    pub const SPACE: usize = 8
        + 8
        + 1
        + 32
        + (4 + MAX_UNIVERSIDAD_SOLICITUD)
        + (4 + MAX_CARRERA_SOLICITUD)
        + (4 + MAX_PLAN_SOLICITUD)
        + (4 + MAX_MATRICULA_SOLICITUD)
        + 2
        + 4
        + 1
        + 32
        + (4 + MAX_ROLE_MOTIVO)
        + 8
        + 8
        + (4 + MAX_REQUEST_METADATA)
        + 8
        + 8
        + 1;
}

#[account]
pub struct CertificationToken {
    pub token_id: u64,
    pub request_id: u64,
    pub universidad_wallet: Pubkey,
    pub universidad: String,
    pub titulo: String,
    pub anio: u16,
    pub status: CertificationTokenStatus,
    pub cantidad_total: u32,
    pub cantidad_disponible: u32,
    pub creado_por: Pubkey,
    pub fecha_creacion: i64,
    pub bump: u8,
}

impl CertificationToken {
    pub const SPACE: usize = 8
        + 8
        + 8
        + 32
        + (4 + MAX_UNIVERSIDAD_SOLICITUD)
        + (4 + MAX_TOKEN_TITULO)
        + 2
        + 1
        + 4
        + 4
        + 32
        + 8
        + 1;
}

#[event]
pub struct ProgramaInicializado {
    pub authority: Pubkey,
}

#[event]
pub struct InstitucionRegistrada {
    pub institution: Pubkey,
    pub nombre: String,
    pub pais: String,
    pub activa: bool,
}

#[event]
pub struct EstadoInstitucionActualizado {
    pub institution: Pubkey,
    pub activa: bool,
}

#[event]
pub struct CredencialEmitida {
    pub credential_id: u64,
    pub issuer: Pubkey,
    pub recipient: Pubkey,
    pub tipo: String,
}

#[event]
pub struct CredencialRevocada {
    pub credential_id: u64,
    pub issuer: Pubkey,
    pub motivo: String,
}

#[event]
pub struct CredencialReemitida {
    pub old_credential_id: u64,
    pub new_credential_id: u64,
    pub issuer: Pubkey,
}

#[event]
pub struct SolicitudRolRegistrada {
    pub request_id: u64,
    pub wallet: Pubkey,
    pub role: UserRole,
}

#[event]
pub struct RolActualizado {
    pub wallet: Pubkey,
    pub role: UserRole,
    pub active: bool,
}

#[event]
pub struct SolicitudMinisterioRegistrada {
    pub request_id: u64,
    pub request_type: MinistryRequestType,
    pub solicitante_wallet: Pubkey,
}

#[event]
pub struct SolicitudMinisterioResuelta {
    pub request_id: u64,
    pub status: MinistryRequestStatus,
    pub reviewed_by: Pubkey,
}

#[event]
pub struct TokenCertificacionCreado {
    pub token_id: u64,
    pub universidad_wallet: Pubkey,
    pub cantidad_total: u32,
}

#[error_code]
pub enum ErrorCertificacion {
    #[msg("La institucion esta inactiva y no puede emitir credenciales")]
    InstitucionInactiva,
    #[msg("El id de credencial no coincide con el consecutivo esperado")]
    IdCredencialInvalido,
    #[msg("El nombre de la institucion supera el maximo permitido")]
    NombreInstitucionMuyLargo,
    #[msg("El pais supera el maximo permitido")]
    PaisMuyLargo,
    #[msg("El tipo de credencial supera el maximo permitido")]
    TipoCredencialMuyLargo,
    #[msg("El nombre del programa supera el maximo permitido")]
    NombreProgramaMuyLargo,
    #[msg("La URI del documento supera el maximo permitido")]
    UriDocumentoMuyLarga,
    #[msg("La fecha de expiracion no es valida")]
    FechaExpiracionInvalida,
    #[msg("La institucion no corresponde al emisor")]
    InstitucionNoCorrespondeAlEmisor,
    #[msg("El estado de la credencial no permite esta operacion")]
    EstadoCredencialInvalido,
    #[msg("No autorizado para operar esta credencial")]
    NoAutorizado,
    #[msg("El motivo de revocacion supera el maximo permitido")]
    MotivoRevocacionMuyLargo,
    #[msg("El motivo de revocacion es obligatorio")]
    MotivoRevocacionVacio,
    #[msg("El codigo de registro es invalido")]
    CodigoRegistroInvalido,
    #[msg("Datos de titular invalidos")]
    TitularInvalido,
    #[msg("La trazabilidad serializada supera el maximo permitido")]
    TrazabilidadMuyLarga,
    #[msg("El rol solicitado no es valido")]
    RolNoPermitido,
    #[msg("Solicitud de rol invalida")]
    SolicitudRolInvalida,
    #[msg("La accion de solicitud es invalida")]
    AccionSolicitudInvalida,
    #[msg("Los datos de solicitud de rol son invalidos")]
    DatosRolInvalidos,
    #[msg("La wallet solicitante no coincide con el firmante de la transaccion")]
    WalletSolicitanteInvalida,
    #[msg("Solicitud ministerial invalida")]
    SolicitudMinisterioInvalida,
    #[msg("Datos de token invalidos")]
    DatosTokenInvalidos,
}
