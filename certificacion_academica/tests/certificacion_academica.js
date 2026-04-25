const anchor = require("@coral-xyz/anchor");
const { expect } = require("chai");

describe("certificacion_academica", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  const program = anchor.workspace.certificacionAcademica;
  const authority = provider.wallet;

  const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  const [institutionPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("institution"), authority.publicKey.toBuffer()],
    program.programId
  );

  const [authorityRoleAssignmentPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("role_assignment"), authority.publicKey.toBuffer()],
    program.programId
  );

  const universidad = anchor.web3.Keypair.generate();
  const ministerio = anchor.web3.Keypair.generate();
  const cancilleria = anchor.web3.Keypair.generate();
  const egresado = anchor.web3.Keypair.generate();

  function enumNombre(value) {
    return String(Object.keys(value || {})[0] || "").toLowerCase();
  }

  it("inicializa el programa", async () => {
    try {
      await program.methods
        .initialize()
        .accounts({
          config: configPda,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    } catch (_e) {
      // Si el validator es persistente, la PDA de config puede existir de una corrida previa.
    }

    const config = await program.account.programConfig.fetch(configPda);
    expect(config.authority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(config.credentialCounter.toNumber()).to.be.at.least(0);
  });

  it("registra una institucion activa", async () => {
    await program.methods
      .registerInstitution(authority.publicKey, "Universidad Nacional Demo", "Argentina")
      .accounts({
        config: configPda,
        institution: institutionPda,
        authorityRoleAssignment: authorityRoleAssignmentPda,
        authority: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const institution = await program.account.institution.fetch(institutionPda);
    expect(institution.wallet.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(institution.isActive).to.equal(true);
  });

  it("emite una credencial", async () => {
    const credentialId = new anchor.BN(1);
    const [credentialPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("credential"),
        authority.publicKey.toBuffer(),
        credentialId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const receptor = anchor.web3.Keypair.generate().publicKey;
    const hashDocumento = Array(32).fill(7);

    await program.methods
      .issueCredential(
        credentialId,
        receptor,
        "Diploma",
        "Ingenieria en Sistemas",
        new anchor.BN(1713398400),
        new anchor.BN(0),
        hashDocumento,
        "ipfs://credencial-demo-001"
      )
      .accounts({
        config: configPda,
        institution: institutionPda,
        credential: credentialPda,
        issuer: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const credencial = await program.account.credential.fetch(credentialPda);
    expect(credencial.credentialId.toNumber()).to.equal(1);
    expect(credencial.programName).to.equal("Ingenieria en Sistemas");
    expect(credencial.documentUri).to.equal("ipfs://credencial-demo-001");

    const config = await program.account.programConfig.fetch(configPda);
    expect(config.credentialCounter.toNumber()).to.equal(1);
  });

  it("rechaza emision si la institucion esta inactiva", async () => {
    await program.methods
      .setInstitutionStatus(false)
      .accounts({
        config: configPda,
        institution: institutionPda,
        authority: authority.publicKey,
      })
      .rpc();

    const credentialId = new anchor.BN(2);
    const [credentialPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("credential"),
        authority.publicKey.toBuffer(),
        credentialId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const receptor = anchor.web3.Keypair.generate().publicKey;
    const hashDocumento = Array(32).fill(9);

    let fallo = false;
    try {
      await program.methods
        .issueCredential(
          credentialId,
          receptor,
          "Diploma",
          "Abogacia",
          new anchor.BN(1713398400),
          new anchor.BN(0),
          hashDocumento,
          "ipfs://credencial-demo-002"
        )
        .accounts({
          config: configPda,
          institution: institutionPda,
          credential: credentialPda,
          issuer: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    } catch (error) {
      fallo = true;
      expect(String(error)).to.include("InstitucionInactiva");
    }

    expect(fallo).to.equal(true);
  });

  it("reactiva institucion y revoca una credencial emitida", async () => {
    await program.methods
      .setInstitutionStatus(true)
      .accounts({
        config: configPda,
        institution: institutionPda,
        authority: authority.publicKey,
      })
      .rpc();

    await program.methods
      .revokeCredential(new anchor.BN(1), "Error en datos del plan de estudios")
      .accounts({
        institution: institutionPda,
        credential: anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from("credential"),
            authority.publicKey.toBuffer(),
            new anchor.BN(1).toArrayLike(Buffer, "le", 8),
          ],
          program.programId
        )[0],
        issuer: authority.publicKey,
      })
      .rpc();

    const credencialRevocada = await program.account.credential.fetch(
      anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("credential"),
          authority.publicKey.toBuffer(),
          new anchor.BN(1).toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      )[0]
    );

    expect(credencialRevocada.revokedReason).to.equal("Error en datos del plan de estudios");
    expect(credencialRevocada.status.revoked).to.not.equal(undefined);
  });

  it("reemite credencial y mantiene trazabilidad", async () => {
    const nuevaCredencialId = new anchor.BN(3);
    const [nuevaCredencialPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("credential"),
        authority.publicKey.toBuffer(),
        nuevaCredencialId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const [credencialAnteriorPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("credential"),
        authority.publicKey.toBuffer(),
        new anchor.BN(2).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .issueCredential(
        new anchor.BN(2),
        anchor.web3.Keypair.generate().publicKey,
        "Diploma",
        "Medicina",
        new anchor.BN(1713398400),
        new anchor.BN(0),
        Array(32).fill(5),
        "ipfs://credencial-demo-003"
      )
      .accounts({
        config: configPda,
        institution: institutionPda,
        credential: credencialAnteriorPda,
        issuer: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .reissueCredential(
        new anchor.BN(2),
        nuevaCredencialId,
        anchor.web3.Keypair.generate().publicKey,
        "Diploma",
        "Medicina",
        new anchor.BN(1713398401),
        new anchor.BN(0),
        Array(32).fill(6),
        "ipfs://credencial-demo-004"
      )
      .accounts({
        config: configPda,
        institution: institutionPda,
        oldCredential: credencialAnteriorPda,
        newCredential: nuevaCredencialPda,
        issuer: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const credencialAnterior = await program.account.credential.fetch(credencialAnteriorPda);
    const credencialNueva = await program.account.credential.fetch(nuevaCredencialPda);

    expect(credencialAnterior.status.reissued).to.not.equal(undefined);
    expect(credencialAnterior.replacedBy.toNumber()).to.equal(3);
    expect(credencialNueva.credentialId.toNumber()).to.equal(3);
    expect(credencialNueva.status.issued).to.not.equal(undefined);
  });

  it("permite assign/update/revoke certification via aliases roadmap", async () => {
    const credentialId = new anchor.BN(4);
    const [credentialPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("credential"),
        authority.publicKey.toBuffer(),
        credentialId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .assignTokenToGraduate(
        credentialId,
        anchor.web3.Keypair.generate().publicKey,
        "Token de carrera",
        "Ingenieria Civil",
        new anchor.BN(1713398402),
        new anchor.BN(0),
        Array(32).fill(8),
        "ipfs://credencial-demo-005"
      )
      .accounts({
        config: configPda,
        institution: institutionPda,
        credential: credentialPda,
        issuer: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .updateCertification(
        credentialId,
        "REG-ALIAS-004",
        "Maria",
        "Lopez",
        "27123456789",
        "Universidad Nacional Demo",
        JSON.stringify([{ actor: "Universidad", paso: "Emision", fecha: "2026-04-19", estado: "Completado" }])
      )
      .accounts({
        institution: institutionPda,
        credential: credentialPda,
        issuer: authority.publicKey,
      })
      .rpc();

    await program.methods
      .revokeCertification(credentialId, "Correccion de certificacion")
      .accounts({
        institution: institutionPda,
        credential: credentialPda,
        issuer: authority.publicKey,
      })
      .rpc();

    const credencial = await program.account.credential.fetch(credentialPda);
    expect(credencial.registryCode).to.equal("REG-ALIAS-004");
    expect(credencial.holderName).to.equal("Maria");
    expect(credencial.status.revoked).to.not.equal(undefined);
  });

  it("bloquea cambios de estado de institucion por usuario no autorizado", async () => {
    const intruso = anchor.web3.Keypair.generate();
    const firma = await connection.requestAirdrop(intruso.publicKey, 2_000_000_000);
    await connection.confirmTransaction(firma, "confirmed");

    let fallo = false;
    try {
      await program.methods
        .setInstitutionStatus(false)
        .accounts({
          config: configPda,
          institution: institutionPda,
          authority: intruso.publicKey,
        })
        .signers([intruso])
        .rpc();
    } catch (error) {
      fallo = true;
      expect(String(error)).to.include("has one constraint was violated");
    }

    expect(fallo).to.equal(true);
  });

  it("configura roles secundarios para flujo ministerial", async () => {
    for (const signer of [universidad, ministerio, cancilleria, egresado]) {
      const firma = await connection.requestAirdrop(signer.publicKey, 2_000_000_000);
      await connection.confirmTransaction(firma, "confirmed");
    }

    const cuentas = [
      { signer: universidad, roleCode: 2 },
      { signer: ministerio, roleCode: 3 },
      { signer: cancilleria, roleCode: 4 },
      { signer: egresado, roleCode: 5 },
    ];

    for (const item of cuentas) {
      const [roleAssignment] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("role_assignment"), item.signer.publicKey.toBuffer()],
        program.programId
      );
      const [authorityRoleAssignment] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("role_assignment"), authority.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .upsertRole(item.signer.publicKey, item.roleCode, true)
        .accounts({
          config: configPda,
          roleAssignment,
          authorityRoleAssignment,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }
  });

  it("universidad solicita y ministerio aprueba token on-chain", async () => {
    const requestId = new anchor.BN(1001);
    const tokenId = new anchor.BN(5001);

    const [ministryRequest] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("ministry_request"),
        universidad.publicKey.toBuffer(),
        requestId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const [authorityRoleAssignmentUni] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), universidad.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .requestTokens(
        requestId,
        universidad.publicKey,
        "Universidad Nacional Demo",
        "Ingenieria Informatica",
        "Plan 2026",
        "MAT-445",
        2026,
        12
      )
      .accounts({
        config: configPda,
        ministryRequest,
        authorityRoleAssignment: authorityRoleAssignmentUni,
        authority: universidad.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([universidad])
      .rpc();

    const [certificationToken] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("certification_token"),
        universidad.publicKey.toBuffer(),
        tokenId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const [authorityRoleAssignmentMin] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), ministerio.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .approveTokenRequest(requestId, tokenId, "Ingenieria Informatica")
      .accounts({
        config: configPda,
        ministryRequest,
        certificationToken,
        authorityRoleAssignment: authorityRoleAssignmentMin,
        authority: ministerio.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([ministerio])
      .rpc();

    const solicitud = await program.account.ministryRequest.fetch(ministryRequest);
    const token = await program.account.certificationToken.fetch(certificationToken);

    expect(enumNombre(solicitud.requestType)).to.equal("tokens");
    expect(enumNombre(solicitud.status)).to.equal("approved");
    expect(solicitud.tokenId.toNumber()).to.equal(5001);
    expect(token.cantidadTotal).to.equal(12);
    expect(token.cantidadDisponible).to.equal(12);
    expect(enumNombre(token.status)).to.equal("disponible");
  });

  it("egresado solicita titulo extranjero y finaliza apostilla on-chain", async () => {
    const requestId = new anchor.BN(2001);
    const tokenMinisterio = new anchor.BN(7001);
    const tokenCancilleria = new anchor.BN(8001);

    const [ministryRequest] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("ministry_request"),
        egresado.publicKey.toBuffer(),
        requestId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const [authorityRoleAssignmentEgr] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), egresado.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .requestForeignTitle(
        requestId,
        egresado.publicKey,
        JSON.stringify({
          titular: { nombre: "Ana", apellido: "Perez", cuitCuil: "27111222333" },
          paisOrigen: "Chile",
        })
      )
      .accounts({
        config: configPda,
        ministryRequest,
        authorityRoleAssignment: authorityRoleAssignmentEgr,
        authority: egresado.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([egresado])
      .rpc();

    const [authorityRoleAssignmentMin] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), ministerio.publicKey.toBuffer()],
      program.programId
    );
    await program.methods
      .processForeignTitle(requestId, 1, tokenMinisterio, "Envio a cancilleria")
      .accounts({
        config: configPda,
        ministryRequest,
        authorityRoleAssignment: authorityRoleAssignmentMin,
        authority: ministerio.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([ministerio])
      .rpc();

    const [authorityRoleAssignmentCan] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), cancilleria.publicKey.toBuffer()],
      program.programId
    );
    await program.methods
      .approveApostille(requestId, 1, tokenCancilleria, "Apostilla aprobada")
      .accounts({
        config: configPda,
        ministryRequest,
        authorityRoleAssignment: authorityRoleAssignmentCan,
        authority: cancilleria.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([cancilleria])
      .rpc();

    const tramite = await program.account.ministryRequest.fetch(ministryRequest);
    expect(enumNombre(tramite.requestType)).to.equal("foreigntitle");
    expect(enumNombre(tramite.status)).to.equal("finalized");
    expect(tramite.tokenId.toNumber()).to.equal(7001);
    expect(tramite.secondaryTokenId.toNumber()).to.equal(8001);
  });

  it("ministerio puede rechazar una solicitud de tokens", async () => {
    const requestId = new anchor.BN(1002);
    const [ministryRequest] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("ministry_request"),
        universidad.publicKey.toBuffer(),
        requestId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const [authorityRoleAssignmentUni] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), universidad.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .requestTokens(
        requestId,
        universidad.publicKey,
        "Universidad Nacional Demo",
        "Derecho",
        "Plan 2026",
        "DER-201",
        2026,
        5
      )
      .accounts({
        config: configPda,
        ministryRequest,
        authorityRoleAssignment: authorityRoleAssignmentUni,
        authority: universidad.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([universidad])
      .rpc();

    const [authorityRoleAssignmentMin] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), ministerio.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .rejectTokenRequest(requestId, "Cupo anual agotado")
      .accounts({
        config: configPda,
        ministryRequest,
        authorityRoleAssignment: authorityRoleAssignmentMin,
        authority: ministerio.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([ministerio])
      .rpc();

    const solicitud = await program.account.ministryRequest.fetch(ministryRequest);
    expect(enumNombre(solicitud.status)).to.equal("rejected");
    expect(solicitud.resolutionReason).to.equal("Cupo anual agotado");
  });

  it("ministerio puede rechazar un titulo extranjero", async () => {
    const requestId = new anchor.BN(2002);
    const [ministryRequest] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("ministry_request"),
        egresado.publicKey.toBuffer(),
        requestId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const [authorityRoleAssignmentEgr] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), egresado.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .requestForeignTitle(
        requestId,
        egresado.publicKey,
        JSON.stringify({
          titular: { nombre: "Luis", apellido: "Lopez", cuitCuil: "20999888777" },
          paisOrigen: "Peru",
        })
      )
      .accounts({
        config: configPda,
        ministryRequest,
        authorityRoleAssignment: authorityRoleAssignmentEgr,
        authority: egresado.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([egresado])
      .rpc();

    const [authorityRoleAssignmentMin] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), ministerio.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .processForeignTitle(requestId, 2, new anchor.BN(0), "Documentacion insuficiente")
      .accounts({
        config: configPda,
        ministryRequest,
        authorityRoleAssignment: authorityRoleAssignmentMin,
        authority: ministerio.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([ministerio])
      .rpc();

    const tramite = await program.account.ministryRequest.fetch(ministryRequest);
    expect(enumNombre(tramite.status)).to.equal("rejected");
    expect(tramite.resolutionReason).to.equal("Documentacion insuficiente");
  });

  it("cancilleria puede rechazar apostilla via rejectApostille", async () => {
    const requestId = new anchor.BN(2003);
    const tokenMinisterio = new anchor.BN(7100);

    const [ministryRequest] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("ministry_request"),
        egresado.publicKey.toBuffer(),
        requestId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const [authorityRoleAssignmentEgr] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), egresado.publicKey.toBuffer()],
      program.programId
    );
    const [authorityRoleAssignmentMin] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), ministerio.publicKey.toBuffer()],
      program.programId
    );
    const [authorityRoleAssignmentCan] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("role_assignment"), cancilleria.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .requestForeignCertification(
        requestId,
        egresado.publicKey,
        JSON.stringify({
          titular: { nombre: "Maria", apellido: "Diaz", cuitCuil: "27123456789" },
          paisOrigen: "Chile",
        })
      )
      .accounts({
        config: configPda,
        ministryRequest,
        authorityRoleAssignment: authorityRoleAssignmentEgr,
        authority: egresado.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([egresado])
      .rpc();

    await program.methods
      .sendToCancilleria(requestId, tokenMinisterio, "Envio formal a cancilleria")
      .accounts({
        config: configPda,
        ministryRequest,
        authorityRoleAssignment: authorityRoleAssignmentMin,
        authority: ministerio.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([ministerio])
      .rpc();

    await program.methods
      .rejectApostille(requestId, "Falta legalizacion documental")
      .accounts({
        config: configPda,
        ministryRequest,
        authorityRoleAssignment: authorityRoleAssignmentCan,
        authority: cancilleria.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([cancilleria])
      .rpc();

    const tramite = await program.account.ministryRequest.fetch(ministryRequest);
    expect(enumNombre(tramite.status)).to.equal("rejected");
    expect(tramite.tokenId.toNumber()).to.equal(7100);
    expect(tramite.resolutionReason).to.equal("Falta legalizacion documental");
  });

  it("rechaza revocacion con motivo vacio", async () => {
    let fallo = false;
    try {
      await program.methods
        .revokeCredential(new anchor.BN(2), "   ")
        .accounts({
          institution: institutionPda,
          credential: anchor.web3.PublicKey.findProgramAddressSync(
            [
              Buffer.from("credential"),
              authority.publicKey.toBuffer(),
              new anchor.BN(2).toArrayLike(Buffer, "le", 8),
            ],
            program.programId
          )[0],
          issuer: authority.publicKey,
        })
        .rpc();
    } catch (error) {
      fallo = true;
      expect(String(error)).to.include("MotivoRevocacionVacio");
    }

    expect(fallo).to.equal(true);
  });

  it("rechaza doble revocacion de la misma credencial", async () => {
    let fallo = false;
    try {
      await program.methods
        .revokeCredential(new anchor.BN(1), "Intento duplicado")
        .accounts({
          institution: institutionPda,
          credential: anchor.web3.PublicKey.findProgramAddressSync(
            [
              Buffer.from("credential"),
              authority.publicKey.toBuffer(),
              new anchor.BN(1).toArrayLike(Buffer, "le", 8),
            ],
            program.programId
          )[0],
          issuer: authority.publicKey,
        })
        .rpc();
    } catch (error) {
      fallo = true;
      expect(String(error)).to.include("EstadoCredencialInvalido");
    }

    expect(fallo).to.equal(true);
  });

  it("rechaza emision con fecha de expiracion invalida", async () => {
    const credentialId = new anchor.BN(5);
    const [credentialPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("credential"),
        authority.publicKey.toBuffer(),
        credentialId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    let fallo = false;
    try {
      await program.methods
        .issueCredential(
          credentialId,
          anchor.web3.Keypair.generate().publicKey,
          "Diploma",
          "Arquitectura",
          new anchor.BN(1713398400),
          new anchor.BN(1713398300),
          Array(32).fill(3),
          "ipfs://credencial-demo-005"
        )
        .accounts({
          config: configPda,
          institution: institutionPda,
          credential: credentialPda,
          issuer: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    } catch (error) {
      fallo = true;
      expect(String(error)).to.include("FechaExpiracionInvalida");
    }

    expect(fallo).to.equal(true);
  });

  it("rechaza emision con nombre de programa fuera de limite", async () => {
    const credentialId = new anchor.BN(5);
    const [credentialPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("credential"),
        authority.publicKey.toBuffer(),
        credentialId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    let fallo = false;
    try {
      await program.methods
        .issueCredential(
          credentialId,
          anchor.web3.Keypair.generate().publicKey,
          "Diploma",
          "X".repeat(129),
          new anchor.BN(1713398400),
          new anchor.BN(0),
          Array(32).fill(1),
          "ipfs://credencial-demo-006"
        )
        .accounts({
          config: configPda,
          institution: institutionPda,
          credential: credentialPda,
          issuer: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    } catch (error) {
      fallo = true;
      expect(String(error)).to.include("NombreProgramaMuyLargo");
    }

    expect(fallo).to.equal(true);
  });
});
